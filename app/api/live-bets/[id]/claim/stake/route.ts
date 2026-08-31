import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { stakeIntoPool } from "@/lib/pool";

// Same one-step pool stake as contest-entries/[id]/claim/stake -- see that
// route and lib/pool.ts for the full rationale.
export async function POST(
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
  if (bet.claimedAt) {
    return NextResponse.json(
      { error: "This payout was already collected, not staked." },
      { status: 409 },
    );
  }
  if (bet.stakedAt) {
    return NextResponse.json({ success: true, alreadyStaked: true });
  }

  const claimedSlot = await prisma.liveBet.updateMany({
    where: { id: bet.id, claimedAt: null, stakedAt: null },
    data: { stakedAt: new Date() },
  });
  if (claimedSlot.count === 0) {
    return NextResponse.json(
      { error: "This payout is already being processed -- try again shortly." },
      { status: 409 },
    );
  }

  try {
    const result = await stakeIntoPool({
      userId: user.id,
      amountWei: BigInt(bet.claimAmountWei),
      sourceLiveBetId: bet.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to stake live bet ${bet.id}`, err);
    await prisma.liveBet.update({
      where: { id: bet.id },
      data: { stakedAt: null },
    });
    return NextResponse.json(
      { error: "Failed to stake your payout. Please try again shortly." },
      { status: 500 },
    );
  }
}
