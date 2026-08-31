import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordRepayment } from "@/lib/pool";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Body-reported amountWei is only a starting point for what to verify --
// recordRepayment (lib/pool.ts) independently confirms the real on-chain
// transfer via verifyTestnetTransfer before trusting any of it.
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

  let body: { txHash?: unknown; amountWei?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { txHash, amountWei } = body;
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json(
      { error: "A valid transaction hash is required." },
      { status: 400 },
    );
  }
  if (typeof amountWei !== "string" || !/^\d+$/.test(amountWei)) {
    return NextResponse.json(
      { error: "A valid repayment amount is required." },
      { status: 400 },
    );
  }

  const loan = await prisma.loan.findUnique({ where: { id: params.id } });
  if (!loan || loan.borrowerUserId !== user.id) {
    return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  }

  try {
    const result = await recordRepayment({
      loanId: loan.id,
      txHash: txHash as Hex,
      amountWei: BigInt(amountWei),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to record repayment for loan ${loan.id}`, err);
    const message =
      err instanceof Error ? err.message : "Failed to record your repayment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
