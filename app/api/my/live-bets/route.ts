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

  const bets = await prisma.liveBet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const matchIds = [...new Set(bets.map((b) => b.matchId))];
  const teamIds = [...new Set(bets.map((b) => b.sideTeamId))];
  const [matches, sideTeams] = await Promise.all([
    prisma.match.findMany({ where: { id: { in: matchIds } } }),
    prisma.team.findMany({ where: { id: { in: teamIds } } }),
  ]);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const teamById = new Map(sideTeams.map((t) => [t.id, t]));

  const opponentIds = [
    ...new Set(
      matches
        .flatMap((m) => [m.team1Id, m.team2Id])
        .filter((id) => !teamById.has(id)),
    ),
  ];
  if (opponentIds.length > 0) {
    const opponents = await prisma.team.findMany({
      where: { id: { in: opponentIds } },
    });
    for (const t of opponents) teamById.set(t.id, t);
  }

  return NextResponse.json({
    bets: bets.map((b) => {
      const match = matchById.get(b.matchId);
      const sideTeam = teamById.get(b.sideTeamId);
      const opponentTeam = match
        ? teamById.get(
            match.team1Id === b.sideTeamId ? match.team2Id : match.team1Id,
          )
        : undefined;
      return {
        id: b.id,
        matchId: b.matchId,
        matchStatus: match?.status ?? null,
        matchLabel:
          sideTeam && opponentTeam
            ? `${sideTeam.shortName} vs ${opponentTeam.shortName}`
            : "Unknown match",
        sideTeamName: sideTeam?.shortName ?? "Unknown",
        stakeCents: b.stakeCents,
        oddsMultiplier: b.oddsMultiplier,
        status: b.status,
        outcome: b.outcome,
        payoutCents: b.payoutCents,
        claimable: Boolean(b.claimId && b.claimAmountWei && !b.claimedAt),
      };
    }),
  });
}
