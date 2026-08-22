import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bets = await prisma.liveBet.findMany({
    orderBy: { createdAt: "desc" },
  });

  const matchIds = [...new Set(bets.map((b) => b.matchId))];
  const userIds = [...new Set(bets.map((b) => b.userId))];
  const teamIds = [...new Set(bets.map((b) => b.sideTeamId))];
  const [matches, users, teams] = await Promise.all([
    prisma.match.findMany({ where: { id: { in: matchIds } } }),
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    prisma.team.findMany({ where: { id: { in: teamIds } } }),
  ]);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const opponentTeamIds = [
    ...new Set(
      bets
        .map((b) => {
          const match = matchById.get(b.matchId);
          if (!match) return null;
          return match.team1Id === b.sideTeamId ? match.team2Id : match.team1Id;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const opponentTeams = await prisma.team.findMany({
    where: { id: { in: opponentTeamIds } },
  });
  for (const t of opponentTeams) teamById.set(t.id, t);

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
        matchLabel:
          sideTeam && opponentTeam
            ? `${sideTeam.shortName} vs ${opponentTeam.shortName}`
            : "Unknown match",
        displayName: userById.get(b.userId)?.displayName ?? "Unknown",
        sideTeamName: sideTeam?.shortName ?? "Unknown",
        stakeCents: b.stakeCents,
        oddsMultiplier: b.oddsMultiplier,
        // coinvoyageOrderId is always set immediately at creation for the
        // CoinVoyage branch and never set for the testnet branch (unlike
        // testnetPaymentTxHash, which stays null until payment is confirmed)
        // -- so this is the only signal that's correct before confirmation.
        paymentMethod: b.coinvoyageOrderId ? "coinvoyage" : "testnet_eth",
        status: b.status,
        outcome: b.outcome,
        payoutCents: b.payoutCents,
        claimedAt: b.claimedAt,
        createdAt: b.createdAt,
      };
    }),
  });
}
