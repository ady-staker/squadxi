import { prisma } from "@/lib/prisma";

// Simple strength-ratio implied-probability model, not a chase/run-rate
// predictor -- match-simulator.ts never exposes a "true" win probability
// anywhere, so this is real-data-driven odds flavor for an MVP, not a
// prediction engine. ~3% house edge mirrors coinflip-site's real
// WIN_MULTIPLIER precedent. Clamped so a large skill gap can't produce an
// absurd or degenerate payout.
const HOUSE_EDGE = 0.97;
const MIN_MULTIPLIER = 1.05;
const MAX_MULTIPLIER = 8;

export type MatchOdds = {
  team1Multiplier: number;
  team2Multiplier: number;
};

function clamp(n: number): number {
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, n));
}

async function teamStrength(teamId: string): Promise<number> {
  const players = await prisma.player.findMany({
    where: { teamId },
    select: { battingSkill: true, bowlingSkill: true },
  });
  if (players.length === 0) return 1; // guards divide-by-zero below, never expected in practice
  const total = players.reduce(
    (sum, p) => sum + (p.battingSkill + p.bowlingSkill) / 2,
    0,
  );
  return total / players.length;
}

export async function computeMatchOdds(
  team1Id: string,
  team2Id: string,
): Promise<MatchOdds> {
  const [strength1, strength2] = await Promise.all([
    teamStrength(team1Id),
    teamStrength(team2Id),
  ]);
  const totalStrength = strength1 + strength2;
  const p1 = totalStrength > 0 ? strength1 / totalStrength : 0.5;
  const p2 = 1 - p1;

  return {
    team1Multiplier: clamp((1 / p1) * HOUSE_EDGE),
    team2Multiplier: clamp((1 / p2) * HOUSE_EDGE),
  };
}

export function multiplierFor(
  odds: MatchOdds,
  sideTeamId: string,
  team1Id: string,
): number {
  return sideTeamId === team1Id ? odds.team1Multiplier : odds.team2Multiplier;
}
