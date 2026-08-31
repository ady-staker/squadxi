import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Read-only claim status/amount, for the Collect-vs-Stake fork UI to render
// before the winner picks either action.
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

  return NextResponse.json({
    claimAmountWei: entry.claimAmountWei,
    claimed: Boolean(entry.claimedAt),
    staked: Boolean(entry.stakedAt),
  });
}
