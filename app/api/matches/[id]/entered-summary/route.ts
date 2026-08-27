import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { autoAdvanceIfDue } from "@/lib/live-advance";

type PlayerSummary = {
  id: string;
  name: string;
  role: string;
  creditValue: number;
  battingSkill: number;
  bowlingSkill: number;
  teamId: string;
};

// Everything the post-entry match view needs in one call: real match
// captains/vice-captains (Team.captainPlayerId/viceCaptainPlayerId), the
// user's own picked captain/VC per fantasy team, and the fill level of
// every contest they actually paid into for this match. Returns
// `entered: false` for anyone without a COMPLETED paid entry here --
// this is deliberately not shown until real money (or testnet ETH) is on
// the table for this specific match.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  await autoAdvanceIfDue(params.id);

  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const myFantasyTeams = await prisma.fantasyTeam.findMany({
    where: { userId: user.id, matchId: match.id },
    select: { id: true, name: true, captainId: true, viceCaptainId: true },
  });
  const teamIds = myFantasyTeams.map((t) => t.id);

  const myEntries =
    teamIds.length > 0
      ? await prisma.contestEntry.findMany({
          where: {
            userId: user.id,
            fantasyTeamId: { in: teamIds },
            paymentStatus: "COMPLETED",
          },
          select: { contestId: true, prizeCents: true, rank: true },
        })
      : [];
  if (myEntries.length === 0) {
    return NextResponse.json({ entered: false });
  }

  const [team1, team2] = await Promise.all([
    prisma.team.findUnique({ where: { id: match.team1Id } }),
    prisma.team.findUnique({ where: { id: match.team2Id } }),
  ]);

  const playerIds = [
    ...new Set(
      [
        team1?.captainPlayerId,
        team1?.viceCaptainPlayerId,
        team2?.captainPlayerId,
        team2?.viceCaptainPlayerId,
        ...myFantasyTeams.flatMap((t) => [t.captainId, t.viceCaptainId]),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  function playerSummary(id: string | null | undefined): PlayerSummary | null {
    const p = id ? playerById.get(id) : undefined;
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      creditValue: Number(p.creditValue),
      battingSkill: p.battingSkill,
      bowlingSkill: p.bowlingSkill,
      teamId: p.teamId,
    };
  }

  const contestIds = [
    ...new Set(
      myEntries
        .map((e) => e.contestId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const myContests =
    contestIds.length > 0
      ? await prisma.contest.findMany({ where: { id: { in: contestIds } } })
      : [];

  return NextResponse.json({
    entered: true,
    match: {
      scheduledAt: match.scheduledAt,
      status: match.status,
      team1: team1
        ? {
            id: team1.id,
            name: team1.name,
            shortName: team1.shortName,
            logo: team1.logo,
            captain: playerSummary(team1.captainPlayerId),
            viceCaptain: playerSummary(team1.viceCaptainPlayerId),
          }
        : null,
      team2: team2
        ? {
            id: team2.id,
            name: team2.name,
            shortName: team2.shortName,
            logo: team2.logo,
            captain: playerSummary(team2.captainPlayerId),
            viceCaptain: playerSummary(team2.viceCaptainPlayerId),
          }
        : null,
    },
    myTeams: myFantasyTeams.map((t) => ({
      id: t.id,
      name: t.name,
      captain: playerSummary(t.captainId),
      viceCaptain: playerSummary(t.viceCaptainId),
    })),
    contests: myContests.map((c) => {
      const mine = myEntries.filter((e) => e.contestId === c.id);
      const myPrizeCents = mine.reduce((sum, e) => sum + e.prizeCents, 0);
      const ranks = mine
        .map((e) => e.rank)
        .filter((r): r is number => r !== null);
      return {
        id: c.id,
        name: c.name,
        currentEntries: c.currentEntries,
        maxEntries: c.maxEntries,
        prizePoolCents: c.prizePoolCents,
        status: c.status,
        myPrizeCents,
        myRank: ranks.length > 0 ? Math.min(...ranks) : null,
      };
    }),
  });
}
