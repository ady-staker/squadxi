import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const status = searchParams.get("status");
  const contests = await prisma.contest.findMany({
    where: {
      ...(matchId ? { matchId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Lets the entry form show "you're already in" on load instead of only
  // after a fresh submit in the same page session.
  const user = await getCurrentUser();
  const myEntryByContestId = new Map<
    string,
    { id: string; paymentStatus: string }
  >();
  if (user && contests.length > 0) {
    const myEntries = await prisma.contestEntry.findMany({
      where: {
        userId: user.id,
        contestId: { in: contests.map((c) => c.id) },
      },
      select: { id: true, contestId: true, paymentStatus: true },
    });
    for (const e of myEntries) {
      if (e.contestId) myEntryByContestId.set(e.contestId, e);
    }
  }

  return NextResponse.json({
    contests: contests.map((c) => ({
      ...c,
      myEntry: myEntryByContestId.get(c.id) ?? null,
    })),
  });
}
