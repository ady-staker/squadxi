import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBonusClaimedOnChain } from "@/lib/robinhood-chain";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

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

  let txHash: unknown;
  try {
    const body = await request.json();
    txHash = body?.txHash;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json(
      { error: "A valid transaction hash is required." },
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
  if (!entry.claimWalletAddress) {
    return NextResponse.json(
      { error: "No wallet address on file for this claim." },
      { status: 409 },
    );
  }

  const verified = await verifyBonusClaimedOnChain(
    txHash as Hex,
    entry.claimId as Hex,
    entry.claimWalletAddress as `0x${string}`,
    BigInt(entry.claimAmountWei),
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Couldn't verify that transaction on-chain." },
      { status: 422 },
    );
  }

  await prisma.contestEntry.update({
    where: { id: entry.id },
    data: { claimTxHash: txHash, claimedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
