import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  signClaimVoucher,
  relayClaim,
  verifyBonusClaimedOnChain,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// Replaces the old voucher+confirm two-step (which needed the winner's own
// wallet to submit claim() between them) with one server-driven action: the
// winner types an address, the operator relays the same claim() call on
// their behalf, and this route waits for on-chain confirmation before
// returning. See lib/robinhood-chain.ts's relayClaim for why this doesn't
// require the relayer to hold the payout amount itself.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  let walletAddress: unknown;
  try {
    const body = await request.json();
    walletAddress = body?.walletAddress;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof walletAddress !== "string" || !ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  const entry = await prisma.contestEntry.findUnique({
    where: { id: params.id },
  });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }
  if (!entry.claimId || !entry.claimAmountWei) {
    return NextResponse.json(
      { error: "This entry has no claimable prize." },
      { status: 404 },
    );
  }
  if (entry.claimedAt) {
    return NextResponse.json({ success: true, alreadyClaimed: true });
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    return NextResponse.json(
      { error: "The Robinhood Chain contract isn't configured yet." },
      { status: 503 },
    );
  }

  if (
    entry.claimWalletAddress &&
    entry.claimWalletAddress.toLowerCase() !== walletAddress.toLowerCase()
  ) {
    return NextResponse.json(
      {
        error:
          "A claim is already in progress for a different wallet on this entry.",
      },
      { status: 409 },
    );
  }
  // CAS: only the first of any concurrent requests gets to relay this claim.
  const claimedSlot = await prisma.contestEntry.updateMany({
    where: { id: entry.id, claimWalletAddress: entry.claimWalletAddress },
    data: { claimWalletAddress: walletAddress },
  });
  if (claimedSlot.count === 0) {
    return NextResponse.json(
      { error: "This claim is already being processed -- try again shortly." },
      { status: 409 },
    );
  }

  const claimId = entry.claimId as Hex;
  const winner = walletAddress as Address;
  const amountWei = BigInt(entry.claimAmountWei);

  try {
    const signature = await signClaimVoucher(claimId, winner, amountWei);
    const txHash = await relayClaim(claimId, winner, amountWei, signature);
    const verified = await verifyBonusClaimedOnChain(
      txHash,
      claimId,
      winner,
      amountWei,
    );
    if (!verified) {
      return NextResponse.json(
        {
          error:
            "The payout didn't verify on-chain. Reference: " +
            entry.claimId +
            " -- please contact support.",
        },
        { status: 500 },
      );
    }

    await prisma.contestEntry.update({
      where: { id: entry.id },
      data: { claimTxHash: txHash, claimedAt: new Date() },
    });
    return NextResponse.json({ success: true, txHash });
  } catch (err) {
    console.error(`Failed to relay claim for contest entry ${entry.id}`, err);
    return NextResponse.json(
      { error: "Failed to send your payout. Please try again shortly." },
      { status: 500 },
    );
  }
}
