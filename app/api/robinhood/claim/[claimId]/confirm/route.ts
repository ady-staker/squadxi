import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  verifyBonusClaimedOnChain,
  TransactionNotYetVisibleError,
} from "@/lib/robinhood-chain";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

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
    return NextResponse.json({ success: true, alreadyClaimed: true });
  }
  if (!claim.walletAddress) {
    return NextResponse.json(
      { error: "No wallet address on file for this claim." },
      { status: 409 },
    );
  }

  let verified: boolean;
  try {
    verified = await verifyBonusClaimedOnChain(
      txHash as Hex,
      claim.claimId as Hex,
      claim.walletAddress as `0x${string}`,
      BigInt(claim.amountWei),
    );
  } catch (err) {
    if (err instanceof TransactionNotYetVisibleError) {
      return NextResponse.json(
        {
          error:
            "That transaction hasn't shown up on-chain yet -- wait a few seconds and try again.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
  if (!verified) {
    return NextResponse.json(
      { error: "Couldn't verify that transaction on-chain." },
      { status: 422 },
    );
  }

  await prisma.roleBonusClaim.update({
    where: { id: claim.id },
    data: { status: "CLAIMED", txHash, claimedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
