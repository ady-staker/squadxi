import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const entries = await prisma.contestEntry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { fantasyTeam: true },
  });

  const contestIds = entries
    .map((e) => e.contestId)
    .filter((id): id is string => Boolean(id));
  const leagueIds = entries
    .map((e) => e.leagueId)
    .filter((id): id is string => Boolean(id));
  const [contests, leagues] = await Promise.all([
    prisma.contest.findMany({ where: { id: { in: contestIds } } }),
    prisma.league.findMany({ where: { id: { in: leagueIds } } }),
  ]);
  const contestById = new Map(contests.map((c) => [c.id, c]));
  const leagueById = new Map(leagues.map((l) => [l.id, l]));

  const matchIds = [...new Set(entries.map((e) => e.fantasyTeam.matchId))];
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
  });
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const roleBonusClaims = await prisma.roleBonusClaim.findMany({
    where: { contestEntryId: { in: entries.map((e) => e.id) } },
  });
  const roleBonusByEntryId = new Map(
    roleBonusClaims.map((c) => [c.contestEntryId, c]),
  );

  return NextResponse.json({
    entries: entries.map((e) => {
      const contest = e.contestId ? contestById.get(e.contestId) : undefined;
      const league = e.leagueId ? leagueById.get(e.leagueId) : undefined;
      const match = matchById.get(e.fantasyTeam.matchId);
      const roleBonus = roleBonusByEntryId.get(e.id);
      return {
        id: e.id,
        matchId: e.fantasyTeam.matchId,
        matchStatus: match?.status ?? null,
        name: contest?.name ?? league?.name ?? "Unknown",
        kind: contest ? "contest" : "league",
        fantasyTeamName: e.fantasyTeam.name,
        totalPoints: Number(e.fantasyTeam.totalPoints),
        paymentStatus: e.paymentStatus,
        rank: e.rank,
        prizeCents: e.prizeCents,
        roleBonus: roleBonus
          ? {
              claimId: roleBonus.claimId,
              role: roleBonus.role,
              status: roleBonus.status,
            }
          : null,
      };
    }),
  });
}
