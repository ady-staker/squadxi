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
  { params }: { params: { claimId: string } },
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

  const claim = await prisma.roleBonusClaim.findUnique({
    where: { claimId: params.claimId },
  });
  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  const entry = await prisma.contestEntry.findUnique({
    where: { id: claim.contestEntryId },
  });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  if (claim.status === "CLAIMED") {
    return NextResponse.json(
      { error: "This bonus has already been claimed." },
      { status: 409 },
    );
  }

  // Wallet is collected lazily, right here at first voucher request -- same
  // nullable-until-claim-time convention as Payout.walletAddress. A later
  // request with a different address just updates it (no on-chain claim has
  // happened yet, so nothing to reconcile).
  await prisma.roleBonusClaim.update({
    where: { id: claim.id },
    data: { walletAddress },
  });

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    return NextResponse.json(
      { error: "The Robinhood Chain contract isn't configured yet." },
      { status: 503 },
    );
  }

  const amountWei = BigInt(claim.amountWei);
  const signature = await signClaimVoucher(
    claim.claimId as `0x${string}`,
    walletAddress as Address,
    amountWei,
  );

  return NextResponse.json({
    claimId: claim.claimId,
    winner: walletAddress,
    amountWei: claim.amountWei,
    signature,
    contractAddress: config.contractAddress,
    chainId: config.chainId,
  });
}
