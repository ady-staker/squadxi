import { prisma } from "@/lib/prisma";
import { generateMatchEvents, type SimPlayer } from "@/lib/match-simulator";
import { aggregatePerformances, type RawPerformance } from "@/lib/aggregate-performance";
import { totalMatchPoints, applyMultiplier, type CaptaincyRole } from "@/lib/scoring";

const TRANSACTION_OPTIONS = { timeout: 20000, maxWait: 10000 };
const DEFAULT_ADVANCE_BY = 6; // one over's worth of legal-and-extra balls, a demo-visible chunk

/** Generates and persists this match's full ball-by-ball log on first use.
 *  seed.ts only pre-generates events for matches seeded as LIVE/COMPLETED
 *  (see prisma/seed.ts) -- the 6 UPCOMING matches have none yet, so the
 *  first Advance click for any of them needs to create the log before
 *  anything can be revealed. generateMatchEvents() is deterministic
 *  (seeded off matchId), so calling it here produces the exact same log a
 *  re-seed would have. winnerTeamId is stored immediately even though the
 *  match isn't complete yet -- safe because no public route returns it
 *  before Match.status is actually COMPLETED (see GET /api/matches/[id]/live). */
async function ensureEventsGenerated(matchId: string): Promise<void> {
  const existingCount = await prisma.matchEvent.count({ where: { matchId } });
  if (existingCount > 0) return;

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const [team1Players, team2Players] = await Promise.all([
    prisma.player.findMany({ where: { teamId: match.team1Id } }),
    prisma.player.findMany({ where: { teamId: match.team2Id } }),
  ]);
  const toSimPlayer = (p: (typeof team1Players)[number]): SimPlayer => ({
    id: p.id,
    name: p.name,
    role: p.role,
    battingSkill: p.battingSkill,
    bowlingSkill: p.bowlingSkill,
  });

  const { events, winnerTeamId } = generateMatchEvents(
    matchId,
    match.team1Id,
    team1Players.map(toSimPlayer),
    match.team2Id,
    team2Players.map(toSimPlayer)
  );

  await prisma.matchEvent.createMany({
    data: events.map((e) => ({ matchId, ...e })),
  });
  await prisma.match.update({
    where: { id: matchId },
    data: { totalEvents: events.length, winnerTeamId },
  });
}

function captaincyFor(playerId: string, captainId: string, viceCaptainId: string): CaptaincyRole {
  if (playerId === captainId) return "CAPTAIN";
  if (playerId === viceCaptainId) return "VICE_CAPTAIN";
  return "NONE";
}

export type AdvanceResult = {
  status: string;
  currentEventSequence: number;
  totalEvents: number;
};

/**
 * Reveals the next `byN` events for a match and recomputes everything
 * downstream in one transaction: PlayerPerformance stat lines + fantasyPoints
 * for every player who has appeared in a revealed event so far, and
 * FantasyTeam.totalPoints (captain 2x / vice-captain 1.5x applied) for every
 * fantasy team built against this match. Recomputes from the full revealed
 * slice each call rather than patching incrementally -- match logs are small
 * (a few hundred events) and this only runs on an admin click, not per
 * request, so simplicity/correctness wins over micro-optimizing an
 * infrequent write path.
 */
export async function advanceMatch(matchId: string, byN: number = DEFAULT_ADVANCE_BY): Promise<AdvanceResult> {
  await ensureEventsGenerated(matchId);

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status === "COMPLETED") {
    return { status: match.status, currentEventSequence: match.currentEventSequence, totalEvents: match.totalEvents };
  }

  const nextSequence = Math.min(match.currentEventSequence + byN, match.totalEvents);

  const revealedEvents = await prisma.matchEvent.findMany({
    where: { matchId, sequence: { lt: nextSequence } },
    orderBy: { sequence: "asc" },
  });
  const perfMap = aggregatePerformances(revealedEvents);

  await prisma.$transaction(async (tx) => {
    for (const [playerId, perf] of perfMap) {
      const fantasyPoints = totalMatchPoints(perf);
      await tx.playerPerformance.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, ...perf, fantasyPoints },
        update: { ...perf, fantasyPoints },
      });
    }

    const newStatus = nextSequence >= match.totalEvents ? "COMPLETED" : "LIVE";
    await tx.match.update({
      where: { id: matchId },
      data: { currentEventSequence: nextSequence, status: newStatus },
    });

    const fantasyTeams = await tx.fantasyTeam.findMany({
      where: { matchId },
      include: { players: true },
    });
    for (const team of fantasyTeams) {
      let totalPoints = 0;
      for (const tp of team.players) {
        const perf = perfMap.get(tp.playerId);
        const basePoints = perf ? totalMatchPoints(perf) : 0;
        totalPoints += applyMultiplier(basePoints, captaincyFor(tp.playerId, team.captainId, team.viceCaptainId));
      }
      await tx.fantasyTeam.update({ where: { id: team.id }, data: { totalPoints } });
    }
  }, TRANSACTION_OPTIONS);

  const updated = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  return {
    status: updated.status,
    currentEventSequence: updated.currentEventSequence,
    totalEvents: updated.totalEvents,
  };
}

export type InningsSummary = {
  innings: number;
  runs: number;
  wickets: number;
  legalBalls: number;
};

/** Derives a simple current-score summary from revealed events, grouped by
 *  innings -- not persisted anywhere, computed fresh on each read since it's
 *  cheap (a few hundred rows at most) and always needs to reflect exactly
 *  what's been revealed as of the read. */
export function summarizeInnings(events: { innings: number; runsScored: number; isWicket: boolean; isWide: boolean; isNoBall: boolean }[]): InningsSummary[] {
  const byInnings = new Map<number, InningsSummary>();
  for (const e of events) {
    let s = byInnings.get(e.innings);
    if (!s) {
      s = { innings: e.innings, runs: 0, wickets: 0, legalBalls: 0 };
      byInnings.set(e.innings, s);
    }
    s.runs += e.runsScored;
    if (e.isWicket) s.wickets += 1;
    if (!e.isWide && !e.isNoBall) s.legalBalls += 1;
  }
  return [...byInnings.values()].sort((a, b) => a.innings - b.innings);
}
