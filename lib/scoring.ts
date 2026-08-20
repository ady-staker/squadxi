// Pure, DB-agnostic T20 fantasy scoring functions -- no Prisma import, so
// these are trivially unit-testable and reusable from both the seed script
// and lib/live-advance.ts (Phase 6) without a database round-trip. Point
// values match the scope document approved before this build started (see
// C:\Users\Adhiraj\.claude\plans\parallel-sauteeing-lynx.md).

export type ScoringInput = {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isOut: boolean;
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

export type CaptaincyRole = "CAPTAIN" | "VICE_CAPTAIN" | "NONE";

/** Converts cricket-notation overs (X.Y = X overs + Y balls, Y in 0-5) to
 *  true decimal overs (X + Y/6) -- needed for an accurate economy-rate
 *  calculation. Comparisons like "oversBowled >= 2" don't need this
 *  conversion (cricket notation and true overs agree on whole-over
 *  thresholds), but a runs-per-over rate does. */
function trueOvers(oversBowled: number): number {
  const whole = Math.trunc(oversBowled);
  const balls = Math.round((oversBowled - whole) * 10);
  return whole + balls / 6;
}

export function scoreBatting(p: Pick<ScoringInput, "runs" | "ballsFaced" | "fours" | "sixes" | "isOut">): number {
  let points = 0;
  points += p.runs;
  points += p.fours * 1;
  points += p.sixes * 2;

  // Milestone bonus, highest tier only.
  if (p.runs >= 100) points += 16;
  else if (p.runs >= 50) points += 8;
  else if (p.runs >= 30) points += 4;

  // Duck: isOut being true already implies the player faced at least one
  // ball (the dismissal ball), so this can't fire for someone who never batted.
  if (p.isOut && p.runs === 0) points -= 2;

  // Strike-rate bonus/penalty, only once a meaningful sample size is faced.
  if (p.ballsFaced >= 10) {
    const strikeRate = (p.runs / p.ballsFaced) * 100;
    if (strikeRate >= 170) points += 6;
    else if (strikeRate >= 150) points += 4;
    else if (strikeRate >= 130) points += 2;
    else if (strikeRate > 70) {
      // neutral zone, 70.01-129.99: no bonus or penalty
    } else if (strikeRate >= 60) points -= 2;
    else if (strikeRate >= 50) points -= 4;
    else points -= 6;
  }

  return points;
}

export function scoreBowling(
  p: Pick<ScoringInput, "oversBowled" | "runsConceded" | "wickets" | "bowledOrLbwWickets" | "maidens">
): number {
  let points = 0;
  points += p.wickets * 25; // excludes run-outs -- PlayerPerformance.wickets already does (see lib/aggregate-performance.ts)

  // Wicket-tally bonus, highest tier only.
  if (p.wickets >= 5) points += 16;
  else if (p.wickets >= 4) points += 12;
  else if (p.wickets >= 3) points += 8;

  points += p.maidens * 8;
  points += p.bowledOrLbwWickets * 8;

  // Economy bonus/penalty, only once a meaningful sample size is bowled.
  if (p.oversBowled >= 2) {
    const economy = p.runsConceded / trueOvers(p.oversBowled);
    if (economy < 5) points += 6;
    else if (economy <= 5.99) points += 4;
    else if (economy <= 7) points += 2;
    else if (economy <= 8) {
      // neutral zone
    } else if (economy < 10) {
      // neutral zone, 8.01-10.99 has no defined band -- treated as neutral
      // like the batting strike-rate gap, see plan notes.
    } else if (economy <= 11) points -= 2;
    else if (economy <= 12) points -= 4;
    else points -= 6;
  }

  return points;
}

export function scoreFielding(
  p: Pick<ScoringInput, "catches" | "stumpings" | "runOutsDirect" | "runOutsAssist">
): number {
  let points = 0;
  points += p.catches * 8;
  if (p.catches >= 3) points += 4; // one-time bonus, not per catch beyond the 3rd
  points += p.stumpings * 12;
  points += p.runOutsDirect * 12;
  points += p.runOutsAssist * 6;
  return points;
}

/** A player's total fantasy points for a match, before any captain/VC
 *  multiplier -- multiplier is applied per fantasy-team selection (Phase 6),
 *  not baked in here, since the same PlayerPerformance row is shared by
 *  every fantasy team that picked that player. */
export function totalMatchPoints(p: ScoringInput): number {
  return scoreBatting(p) + scoreBowling(p) + scoreFielding(p);
}

export function applyMultiplier(points: number, captaincy: CaptaincyRole): number {
  if (captaincy === "CAPTAIN") return points * 2;
  if (captaincy === "VICE_CAPTAIN") return points * 1.5;
  return points;
}
