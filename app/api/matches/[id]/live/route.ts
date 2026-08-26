import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeInnings } from "@/lib/live-advance";
import { computeMatchOdds } from "@/lib/live-bet-odds";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const revealedEvents = await prisma.matchEvent.findMany({
    where: { matchId: match.id, sequence: { lt: match.currentEventSequence } },
    orderBy: { sequence: "asc" },
    select: {
      innings: true,
      runsScored: true,
      isWicket: true,
      isWide: true,
      isNoBall: true,
    },
  });
  const innings = summarizeInnings(revealedEvents);

  const [team1, team2] = await Promise.all([
    prisma.team.findUnique({ where: { id: match.team1Id } }),
    prisma.team.findUnique({ where: { id: match.team2Id } }),
  ]);

  // Only computed while betting is actually open -- odds aren't meaningful
  // (or shown) once a match is UPCOMING or COMPLETED.
  const odds =
    match.status === "LIVE"
      ? await computeMatchOdds(match.team1Id, match.team2Id)
      : null;

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contestId");
  const leagueId = searchParams.get("leagueId");

  let entries;
  if (contestId || leagueId) {
    entries = await prisma.contestEntry.findMany({
      where: contestId ? { contestId } : { leagueId },
      include: { fantasyTeam: true },
    });
  } else {
    // No contest/league scope given -- fall back to every fantasy team built
    // for this match, useful for a quick admin-side check of the whole field.
    const teams = await prisma.fantasyTeam.findMany({
      where: { matchId: match.id },
    });
    entries = teams.map((t) => ({ userId: t.userId, fantasyTeam: t }));
  }

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const displayNameByUserId = new Map(users.map((u) => [u.id, u.displayName]));

  const leaderboard = entries
    .map((e) => ({
      userId: e.userId,
      displayName: displayNameByUserId.get(e.userId) ?? "Unknown",
      fantasyTeamName: e.fantasyTeam.name,
      totalPoints: Number(e.fantasyTeam.totalPoints),
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // Lets LiveBetPanel show "your bets on this match" on load, not just
  // right after a fresh submit in the same page session.
  const user = await getCurrentUser();
  const myBets = user
    ? await prisma.liveBet.findMany({
        where: { matchId: match.id, userId: user.id, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sideTeamId: true,
          stakeCents: true,
          oddsMultiplier: true,
        },
      })
    : [];

  return NextResponse.json({
    myBets: myBets.map((b) => ({
      id: b.id,
      sideTeamId: b.sideTeamId,
      stakeCents: b.stakeCents,
      oddsMultiplier: b.oddsMultiplier.toString(),
    })),
    match: {
      id: match.id,
      status: match.status,
      currentEventSequence: match.currentEventSequence,
      totalEvents: match.totalEvents,
      // Only revealed once the match has actually finished -- see
      // lib/live-advance.ts's ensureEventsGenerated() comment on why this
      // is stored ahead of time but must never leak here before then.
      winnerTeamId: match.status === "COMPLETED" ? match.winnerTeamId : null,
      team1: team1
        ? { id: team1.id, shortName: team1.shortName, name: team1.name }
        : null,
      team2: team2
        ? { id: team2.id, shortName: team2.shortName, name: team2.name }
        : null,
      odds,
    },
    innings,
    leaderboard,
  });
}
