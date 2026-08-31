import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { stakeIntoPool } from "@/lib/pool";

// Stakes a claimable prize into the shared pool instead of collecting it --
// no wallet/on-chain step, since the underlying funds don't move anywhere
// (see lib/pool.ts). Mutually exclusive with .../claim/collect via the
// claimedAt/stakedAt CAS guard below, mirrored in that route too.
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
      { error: "This prize was already collected, not staked." },
      { status: 409 },
    );
  }
  if (entry.stakedAt) {
    return NextResponse.json({ success: true, alreadyStaked: true });
  }

  const claimedSlot = await prisma.contestEntry.updateMany({
    where: { id: entry.id, claimedAt: null, stakedAt: null },
    data: { stakedAt: new Date() },
  });
  if (claimedSlot.count === 0) {
    return NextResponse.json(
      { error: "This prize is already being processed -- try again shortly." },
      { status: 409 },
    );
  }

  try {
    const result = await stakeIntoPool({
      userId: user.id,
      amountWei: BigInt(entry.claimAmountWei),
      sourceContestEntryId: entry.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to stake contest entry ${entry.id}`, err);
    // Best-effort rollback so a failed stake doesn't permanently strand
    // this prize as neither claimed nor staked.
    await prisma.contestEntry.update({
      where: { id: entry.id },
      data: { stakedAt: null },
    });
    return NextResponse.json(
      { error: "Failed to stake your prize. Please try again shortly." },
      { status: 500 },
    );
  }
}
