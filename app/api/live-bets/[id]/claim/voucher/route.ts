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
    return NextResponse.json(
      { error: "This bet has already been claimed." },
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

  // Wallet is collected lazily, at first voucher request -- but unlike
  // RoleBonusClaim.walletAddress (which tolerates a later request silently
  // overwriting it, since nothing on-chain has happened yet), confirm/route.ts
  // verifies the on-chain event's winner against this exact column read
  // fresh at confirm time. Letting a second request quietly repoint it would
  // let an in-flight, already-submitted, genuinely valid claim tx get
  // rejected at confirm because the DB now expects a different wallet. So
  // once a wallet is on file for an unclaimed bet, it's locked until claimed.
  // Compared case-insensitively -- same convention as verifyBonusClaimedOnChain
  // and the client's own submitClaim(), since wallet connectors don't
  // consistently return the same case across calls.
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
  await prisma.liveBet.update({
    where: { id: bet.id },
    data: { claimWalletAddress: walletAddress },
  });

  const amountWei = BigInt(bet.claimAmountWei);
  const signature = await signClaimVoucher(
    bet.claimId as `0x${string}`,
    walletAddress as Address,
    amountWei,
  );

  return NextResponse.json({
    claimId: bet.claimId,
    winner: walletAddress,
    amountWei: bet.claimAmountWei,
    signature,
    contractAddress: config.contractAddress,
    chainId: config.chainId,
  });
}
