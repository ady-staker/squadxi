import type { SimEvent } from "@/lib/match-simulator";

// Raw per-player stat line derived from a slice of a match's MatchEvent log.
// Deliberately excludes fantasyPoints -- lib/scoring.ts (Phase 4) turns this
// into points; this file only turns events into counting stats. Reused by
// both prisma/seed.ts (aggregating a full completed match at seed time) and
// lib/live-advance.ts (Phase 6, aggregating incrementally as events are
// revealed) so the two never drift out of sync with each other.
export type RawPerformance = {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalType: string | null;
  oversBowled: number; // cricket notation: whole.balls, e.g. 3.4 = 3 overs + 4 balls
  runsConceded: number;
  wickets: number;
  bowledOrLbwWickets: number;
  maidens: number;
  catches: number;
  stumpings: number;
  runOutsDirect: number;
  runOutsAssist: number;
};

function empty(): RawPerformance {
  return {
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
    dismissalType: null,
    oversBowled: 0,
    runsConceded: 0,
    wickets: 0,
    bowledOrLbwWickets: 0,
    maidens: 0,
    catches: 0,
    stumpings: 0,
    runOutsDirect: 0,
    runOutsAssist: 0,
  };
}

/** Aggregates a (possibly partial) ordered slice of a match's events into a
 *  per-player raw stat line. Only legal balls (not wide/no-ball) count
 *  toward batting/bowling stats, matching real cricket scoring rules. */
export function aggregatePerformances(events: SimEvent[]): Map<string, RawPerformance> {
  const stats = new Map<string, RawPerformance>();
  const get = (playerId: string) => {
    let s = stats.get(playerId);
    if (!s) {
      s = empty();
      stats.set(playerId, s);
    }
    return s;
  };

  // (bowlerId, innings, over) -> runs conceded in that over, for maiden detection
  const overRuns = new Map<string, number>();
  // (bowlerId, innings, over) -> legal balls bowled in that over
  const overBalls = new Map<string, number>();
  const seenOvers = new Set<string>();

  for (const ev of events) {
    if (ev.isWide || ev.isNoBall) continue; // no personal batting/bowling credit

    const batsman = get(ev.batsmanId);
    batsman.runs += ev.runsScored;
    batsman.ballsFaced += 1;
    if (ev.runsScored === 4) batsman.fours += 1;
    if (ev.runsScored === 6) batsman.sixes += 1;

    const overKey = `${ev.bowlerId}:${ev.innings}:${ev.over}`;
    seenOvers.add(overKey);
    overRuns.set(overKey, (overRuns.get(overKey) ?? 0) + ev.runsScored);
    overBalls.set(overKey, (overBalls.get(overKey) ?? 0) + 1);

    if (ev.isWicket) {
      if (ev.dismissedPlayerId) {
        const dismissed = get(ev.dismissedPlayerId);
        dismissed.isOut = true;
        dismissed.dismissalType = ev.dismissalType;
      }
      if (ev.dismissalType !== "RUN_OUT") {
        const bowler = get(ev.bowlerId);
        bowler.wickets += 1;
        if (ev.dismissalType === "BOWLED" || ev.dismissalType === "LBW") {
          bowler.bowledOrLbwWickets += 1;
        }
      }
      if (ev.dismissalType === "CAUGHT" && ev.fielderId) {
        get(ev.fielderId).catches += 1;
      } else if (ev.dismissalType === "STUMPED" && ev.fielderId) {
        get(ev.fielderId).stumpings += 1;
      } else if (ev.dismissalType === "RUN_OUT" && ev.fielderId) {
        if (ev.assistFielderId) {
          get(ev.fielderId).runOutsAssist += 1;
          get(ev.assistFielderId).runOutsAssist += 1;
        } else {
          get(ev.fielderId).runOutsDirect += 1;
        }
      }
    }
  }

  // Bowling totals: runsConceded (all legal-ball runs in overs this bowler
  // bowled), oversBowled (cricket notation), maidens (0-run completed overs).
  const bowlerOverKeys = new Map<string, string[]>();
  for (const key of seenOvers) {
    const bowlerId = key.split(":")[0];
    const list = bowlerOverKeys.get(bowlerId) ?? [];
    list.push(key);
    bowlerOverKeys.set(bowlerId, list);
  }
  for (const [bowlerId, keys] of bowlerOverKeys) {
    const bowler = get(bowlerId);
    let completedOvers = 0;
    let ballsInPartialOver = 0;
    for (const key of keys) {
      const runs = overRuns.get(key) ?? 0;
      const balls = overBalls.get(key) ?? 0;
      bowler.runsConceded += runs;
      if (balls >= 6) {
        completedOvers += 1;
        if (runs === 0) bowler.maidens += 1;
      } else {
        ballsInPartialOver += balls; // at most one partial over should exist per bowler at any cursor
      }
    }
    bowler.oversBowled = completedOvers + ballsInPartialOver / 10;
  }

  return stats;
}
