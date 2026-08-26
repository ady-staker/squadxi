import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Was static (build-time only) before contestSummary existed here -- match
// status and contest fill level both change constantly, so this can never
// be cached across deploys.
export const dynamic = "force-dynamic";

export async function GET() {
  const matches = await prisma.match.findMany({
    orderBy: { scheduledAt: "asc" },
  });
  const teamIds = [...new Set(matches.flatMap((m) => [m.team1Id, m.team2Id]))];
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } } });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Lets the match list preview "worth entering?" without a click-through --
  // the highest single prize pool and the combined fill level across every
  // OPEN contest on that match.
  const contests = await prisma.contest.findMany({
    where: { matchId: { in: matches.map((m) => m.id) }, status: "OPEN" },
    select: {
      matchId: true,
      prizePoolCents: true,
      currentEntries: true,
      maxEntries: true,
    },
  });
  const contestsByMatch = new Map<string, typeof contests>();
  for (const c of contests) {
    const arr = contestsByMatch.get(c.matchId) ?? [];
    arr.push(c);
    contestsByMatch.set(c.matchId, arr);
  }

  return NextResponse.json({
    matches: matches.map((m) => {
      const matchContests = contestsByMatch.get(m.id) ?? [];
      const contestSummary =
        matchContests.length > 0
          ? {
              topPrizePoolCents: Math.max(
                ...matchContests.map((c) => c.prizePoolCents),
              ),
              currentEntries: matchContests.reduce(
                (sum, c) => sum + c.currentEntries,
                0,
              ),
              maxEntries: matchContests.reduce(
                (sum, c) => sum + c.maxEntries,
                0,
              ),
            }
          : null;
      return {
        id: m.id,
        status: m.status,
        venue: m.venue,
        format: m.format,
        scheduledAt: m.scheduledAt,
        team1: teamById.get(m.team1Id) ?? null,
        team2: teamById.get(m.team2Id) ?? null,
        contestSummary,
      };
    }),
  });
}
