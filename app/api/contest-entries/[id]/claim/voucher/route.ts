import { NextResponse } from "next/server";
import type { Address } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  signClaimVoucher,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
    return NextResponse.json(
      { error: "This prize has already been claimed." },
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

  // Same locked-once-on-file convention as LiveBet's claim voucher route --
  // confirm/route.ts verifies the on-chain event's winner against this
  // exact column read fresh at confirm time, so a second request silently
  // repointing it could reject an already-submitted, genuinely valid claim.
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
  await prisma.contestEntry.update({
    where: { id: entry.id },
    data: { claimWalletAddress: walletAddress },
  });

  const amountWei = BigInt(entry.claimAmountWei);
  const signature = await signClaimVoucher(
    entry.claimId as `0x${string}`,
    walletAddress as Address,
    amountWei,
  );

  return NextResponse.json({
    claimId: entry.claimId,
    winner: walletAddress,
    amountWei: entry.claimAmountWei,
    signature,
    contractAddress: config.contractAddress,
    chainId: config.chainId,
  });
}
