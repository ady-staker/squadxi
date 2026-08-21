// Generates a full pre-computed ball-by-ball log for a mock T20 match. No
// real cricket data feed exists in this app (see README) -- "live" matches
// are these events revealed progressively by an admin-clicked Advance
// control (lib/live-advance.ts), not a real broadcast. Runs at seed time
// only, so it deliberately has no "server-only" import (executed by
// prisma/seed.ts via tsx, outside the Next.js runtime).

export type SimPlayer = {
  id: string;
  name: string;
  role: string; // WK | BAT | BOWL | AR
  battingSkill: number; // 1-100
  bowlingSkill: number; // 1-100
};

export type SimEvent = {
  sequence: number;
  innings: number;
  over: number;
  ballInOver: number;
  battingTeamId: string;
  bowlingTeamId: string;
  batsmanId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsScored: number;
  isWide: boolean;
  isNoBall: boolean;
  isWicket: boolean;
  dismissalType: string | null;
  dismissedPlayerId: string | null;
  fielderId: string | null;
  assistFielderId: string | null;
};

const OVERS_PER_INNINGS = 20;
const DISMISSAL_TYPES = [
  "BOWLED",
  "CAUGHT",
  "LBW",
  "RUN_OUT",
  "STUMPED",
] as const;

/** Picks a plausible 11-player batting/bowling XI from a ~15-player squad,
 *  favoring higher-skill players -- unselected squad players simply get no
 *  events (and so score 0), same as a real bench player. No "playing XI" is
 *  persisted; this selection only exists for the duration of simulation. */
function pickPlayingXI(squad: SimPlayer[]): SimPlayer[] {
  const wk = squad
    .filter((p) => p.role === "WK")
    .sort((a, b) => b.battingSkill - a.battingSkill);
  const bat = squad
    .filter((p) => p.role === "BAT")
    .sort((a, b) => b.battingSkill - a.battingSkill);
  const bowl = squad
    .filter((p) => p.role === "BOWL")
    .sort((a, b) => b.bowlingSkill - a.bowlingSkill);
  const ar = squad
    .filter((p) => p.role === "AR")
    .sort(
      (a, b) =>
        b.battingSkill + b.bowlingSkill - (a.battingSkill + a.bowlingSkill),
    );

  const xi = [
    ...wk.slice(0, 1),
    ...bat.slice(0, 5),
    ...bowl.slice(0, 4),
    ...ar.slice(0, 3),
  ];
  // Top up to 11 from whatever's left, in case a squad is short a role.
  if (xi.length < 11) {
    const chosen = new Set(xi.map((p) => p.id));
    for (const p of squad) {
      if (xi.length >= 11) break;
      if (!chosen.has(p.id)) xi.push(p);
    }
  }
  return xi.slice(0, 11);
}

function weightedBallOutcome(
  rng: () => number,
  batSkill: number,
  bowlSkill: number,
) {
  // Skill delta shifts probability mass between dot/single/boundary/wicket.
  // Positive delta = batter favored; negative = bowler favored. Clamped to
  // keep every outcome possible regardless of skill gap.
  const delta = Math.max(-40, Math.min(40, batSkill - bowlSkill));
  const wicketChance = Math.max(0.02, 0.09 - delta * 0.0009);
  const sixChance = Math.max(0.01, 0.045 + delta * 0.0008);
  const fourChance = Math.max(0.03, 0.09 + delta * 0.0008);
  const dotChance = Math.max(0.18, 0.42 - delta * 0.0011);

  const r = rng();
  let acc = 0;
  if ((acc += wicketChance) > r) return { runs: 0, wicket: true };
  if ((acc += sixChance) > r) return { runs: 6, wicket: false };
  if ((acc += fourChance) > r) return { runs: 4, wicket: false };
  if ((acc += dotChance) > r) return { runs: 0, wicket: false };
  const remaining = 1 - acc;
  const rest = (r - acc) / remaining; // 0..1 within the remaining mass
  if (rest < 0.5) return { runs: 1, wicket: false };
  if (rest < 0.8) return { runs: 2, wicket: false };
  return { runs: 3, wicket: false };
}

/** Deterministic PRNG (mulberry32) seeded per match so a match's generated
 *  events are reproducible -- useful for debugging a specific seeded match
 *  without the simulator producing different results on re-seed. */
function mulberry32(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(matchId: string): number {
  let h = 0;
  for (let i = 0; i < matchId.length; i++)
    h = (Math.imul(31, h) + matchId.charCodeAt(i)) | 0;
  return h;
}

/** Simulates a full two-innings T20 match and returns its complete
 *  ball-by-ball log in sequence order, plus which team won. First innings
 *  runs to completion (20 overs or 10 wickets); second innings additionally
 *  stops the moment the target is passed, same as a real chase. */
export function generateMatchEvents(
  matchId: string,
  team1Id: string,
  team1Squad: SimPlayer[],
  team2Id: string,
  team2Squad: SimPlayer[],
): { events: SimEvent[]; winnerTeamId: string } {
  const rng = mulberry32(hashSeed(matchId));
  const team1XI = pickPlayingXI(team1Squad);
  const team2XI = pickPlayingXI(team2Squad);

  const events: SimEvent[] = [];
  let sequence = 0;
  let firstInningsRuns = 0;

  function simulateInnings(
    innings: number,
    battingTeamId: string,
    battingXI: SimPlayer[],
    bowlingTeamId: string,
    bowlingXI: SimPlayer[],
    target: number | null,
  ): number {
    const batters = [...battingXI];
    const bowlers = bowlingXI.filter(
      (p) => p.role === "BOWL" || p.role === "AR",
    );
    const usableBowlers = bowlers.length > 0 ? bowlers : bowlingXI;

    let strikerIdx = 0;
    let nonStrikerIdx = 1;
    let wicketsDown = 0;
    let totalRuns = 0;
    let bowlerOversCount = new Map<string, number>();

    for (let over = 0; over < OVERS_PER_INNINGS; over++) {
      if (wicketsDown >= 10) break;
      if (target !== null && totalRuns >= target) break;

      // Rotate bowlers roughly evenly, max 4 overs each (T20 rule), skewed
      // toward higher-bowlingSkill bowlers getting more overs.
      const bowler =
        usableBowlers
          .filter((b) => (bowlerOversCount.get(b.id) ?? 0) < 4)
          .sort((a, b) => {
            const aCount = bowlerOversCount.get(a.id) ?? 0;
            const bCount = bowlerOversCount.get(b.id) ?? 0;
            if (aCount !== bCount) return aCount - bCount;
            return b.bowlingSkill - a.bowlingSkill;
          })[0] ?? usableBowlers[over % usableBowlers.length];
      bowlerOversCount.set(
        bowler.id,
        (bowlerOversCount.get(bowler.id) ?? 0) + 1,
      );

      let ballsBowledThisOver = 0;
      let ballInOver = 0;
      while (ballsBowledThisOver < 6) {
        if (wicketsDown >= 10) break;
        if (target !== null && totalRuns >= target) break;

        const striker = batters[strikerIdx];
        const nonStriker = batters[nonStrikerIdx];
        const outcome = weightedBallOutcome(
          rng,
          striker.battingSkill,
          bowler.bowlingSkill,
        );

        // Small chance of a wide/no-ball (extra ball, not counted toward
        // the over, no wicket risk) to keep totals from feeling too clean.
        const isExtra = rng() < 0.06;
        if (isExtra) {
          totalRuns += 1;
          events.push({
            sequence: sequence++,
            innings,
            over,
            ballInOver,
            battingTeamId,
            bowlingTeamId,
            batsmanId: striker.id,
            nonStrikerId: nonStriker.id,
            bowlerId: bowler.id,
            runsScored: 1,
            isWide: rng() < 0.7,
            isNoBall: rng() >= 0.7,
            isWicket: false,
            dismissalType: null,
            dismissedPlayerId: null,
            fielderId: null,
            assistFielderId: null,
          });
          continue; // does not consume a legal ball
        }

        ballInOver++;
        ballsBowledThisOver++;

        if (outcome.wicket) {
          wicketsDown++;
          const dismissalType =
            DISMISSAL_TYPES[Math.floor(rng() * DISMISSAL_TYPES.length)];
          const needsFielder =
            dismissalType === "CAUGHT" ||
            dismissalType === "RUN_OUT" ||
            dismissalType === "STUMPED";
          const fielder = needsFielder
            ? usableBowlers[Math.floor(rng() * usableBowlers.length)]
            : null;
          const assistFielder =
            dismissalType === "RUN_OUT" && rng() < 0.4
              ? usableBowlers[Math.floor(rng() * usableBowlers.length)]
              : null;

          events.push({
            sequence: sequence++,
            innings,
            over,
            ballInOver,
            battingTeamId,
            bowlingTeamId,
            batsmanId: striker.id,
            nonStrikerId: nonStriker.id,
            bowlerId: bowler.id,
            runsScored: 0,
            isWide: false,
            isNoBall: false,
            isWicket: true,
            dismissalType,
            dismissedPlayerId: striker.id,
            fielderId: fielder?.id ?? null,
            assistFielderId: assistFielder?.id ?? null,
          });

          const nextBatterIdx = wicketsDown + 1; // batters[0..1] already in, next is index (wickets+1)
          if (nextBatterIdx < batters.length) {
            strikerIdx = nextBatterIdx;
          }
        } else {
          totalRuns += outcome.runs;
          events.push({
            sequence: sequence++,
            innings,
            over,
            ballInOver,
            battingTeamId,
            bowlingTeamId,
            batsmanId: striker.id,
            nonStrikerId: nonStriker.id,
            bowlerId: bowler.id,
            runsScored: outcome.runs,
            isWide: false,
            isNoBall: false,
            isWicket: false,
            dismissalType: null,
            dismissedPlayerId: null,
            fielderId: null,
            assistFielderId: null,
          });
          if (outcome.runs % 2 === 1) {
            [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
          }
        }
      }
      // Strike rotates at the end of each completed over.
      [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
    }

    return totalRuns;
  }

  firstInningsRuns = simulateInnings(
    1,
    team1Id,
    team1XI,
    team2Id,
    team2XI,
    null,
  );
  const secondInningsRuns = simulateInnings(
    2,
    team2Id,
    team2XI,
    team1Id,
    team1XI,
    firstInningsRuns + 1,
  );

  const winnerTeamId = secondInningsRuns > firstInningsRuns ? team2Id : team1Id;
  return { events, winnerTeamId };
}
