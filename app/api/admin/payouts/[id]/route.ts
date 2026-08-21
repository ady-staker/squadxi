import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type MarkPaidBody = { txNote?: string };

/** Marks a payout as paid -- the one write action in the manual payout
 *  process (CoinVoyage has no way to send this automatically, see the
 *  Payout model's doc comment). Gated on `status: "PENDING"` in the WHERE
 *  clause (an `updateMany`, not `update`) so a double-click or two open
 *  admin tabs can only ever flip it once. Also requires walletAddress to
 *  already be set -- unlike coinflip-site (where a wallet exists from bet
 *  placement), this app collects a winner's wallet lazily, so there's a
 *  real window where a Payout exists but there's genuinely nowhere to have
 *  sent the money yet. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const txNote = (body as MarkPaidBody | null)?.txNote;
  if (txNote !== undefined && typeof txNote !== "string") {
    return NextResponse.json(
      { error: "txNote must be a string." },
      { status: 400 },
    );
  }

  const existing = await prisma.payout.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  }
  if (!existing.walletAddress) {
    return NextResponse.json(
      {
        error:
          "This winner hasn't provided a payout wallet yet -- nothing to mark paid to.",
      },
      { status: 409 },
    );
  }

  const result = await prisma.payout.updateMany({
    where: { id: params.id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      txNote: txNote?.trim() || null,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "This payout was already marked paid." },
      { status: 409 },
    );
  }

  const updated = await prisma.payout.findUniqueOrThrow({
    where: { id: params.id },
  });
  return NextResponse.json({
    payoutId: updated.id,
    status: updated.status,
    paidAt: updated.paidAt,
    txNote: updated.txNote,
  });
}
