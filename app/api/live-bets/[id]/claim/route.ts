import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Same read-only claim status/amount as contest-entries/[id]/claim -- see
// that route for the full rationale.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
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

  return NextResponse.json({
    claimAmountWei: bet.claimAmountWei,
    claimed: Boolean(bet.claimedAt),
    staked: Boolean(bet.stakedAt),
  });
}
