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

// Same one-step relayed claim as contest-entries/[id]/claim/collect -- see
// that route and lib/robinhood-chain.ts's relayClaim for the full rationale.
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

  const bet = await prisma.liveBet.findUnique({ where: { id: params.id } });
  if (!bet || bet.userId !== user.id) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (!bet.claimId || !bet.claimAmountWei) {
    return NextResponse.json(
      { error: "This bet has no claimable payout." },
      { status: 404 },
    );
  }
  if (bet.claimedAt) {
    return NextResponse.json({ success: true, alreadyClaimed: true });
  }
  if (bet.stakedAt) {
    return NextResponse.json(
      { error: "This payout was already staked into the pool, not claimed." },
      { status: 409 },
    );
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    return NextResponse.json(
      { error: "The Robinhood Chain contract isn't configured yet." },
      { status: 503 },
    );
  }

  if (
    bet.claimWalletAddress &&
    bet.claimWalletAddress.toLowerCase() !== walletAddress.toLowerCase()
  ) {
    return NextResponse.json(
      {
        error:
          "A claim is already in progress for a different wallet on this bet.",
      },
      { status: 409 },
    );
  }
  // stakedAt: null also guards against racing a concurrent stake request.
  const claimedSlot = await prisma.liveBet.updateMany({
    where: {
      id: bet.id,
      claimWalletAddress: bet.claimWalletAddress,
      stakedAt: null,
    },
    data: { claimWalletAddress: walletAddress },
  });
  if (claimedSlot.count === 0) {
    return NextResponse.json(
      { error: "This claim is already being processed -- try again shortly." },
      { status: 409 },
    );
  }

  const claimId = bet.claimId as Hex;
  const winner = walletAddress as Address;
  const amountWei = BigInt(bet.claimAmountWei);

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
            bet.claimId +
            " -- please contact support.",
        },
        { status: 500 },
      );
    }

    await prisma.liveBet.update({
      where: { id: bet.id },
      data: { claimTxHash: txHash, claimedAt: new Date() },
    });
    return NextResponse.json({ success: true, txHash });
  } catch (err) {
    console.error(`Failed to relay claim for live bet ${bet.id}`, err);
    return NextResponse.json(
      { error: "Failed to send your payout. Please try again shortly." },
      { status: 500 },
    );
  }
}
