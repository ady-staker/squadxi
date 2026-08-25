import "server-only";
import { prisma } from "@/lib/prisma";

// Deterministic PRNG seeded from the match id so a completed match's
// "sample" numbers are stable across reloads instead of reshuffling every
// request -- mulberry32, good enough for display data, not cryptographic.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h;
}

function fakeWallet(random: () => number): string {
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) addr += chars[Math.floor(random() * 16)];
  return addr;
}

export type MatchInsights = {
  totalEntries: number;
  totalBets: number;
  totalWageredCents: number;
  teamBetSplit: { teamId: string; shortName: string; betCount: number }[];
  topPlayers: {
    id: string;
    name: string;
    role: string;
    teamShortName: string;
    pickPct: number;
  }[];
  topPerformer: {
    name: string;
    teamShortName: string;
    role: string;
    fantasyPoints: number;
    isReal: boolean;
  } | null;
  prizePoolCents: number;
  winnerWallet: string;
  winnerPrizeCents: number;
};

/** Real data where a completed match actually has it (top performer, via
 *  PlayerPerformance); deterministic seeded sample numbers everywhere else,
 *  since this app has no real usage yet -- never written to the DB, purely
 *  computed for display. */
export async function getMatchInsights(
  matchId: string,
): Promise<MatchInsights | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "COMPLETED" || !match.winnerTeamId)
    return null;

  const [team1, team2, allPlayers, performances] = await Promise.all([
    prisma.team.findUnique({ where: { id: match.team1Id } }),
    prisma.team.findUnique({ where: { id: match.team2Id } }),
    prisma.player.findMany({
      where: { teamId: { in: [match.team1Id, match.team2Id] } },
    }),
    prisma.playerPerformance.findMany({
      where: { matchId },
      orderBy: { fantasyPoints: "desc" },
      take: 1,
    }),
  ]);
  if (!team1 || !team2) return null;

  const teamById = new Map([
    [team1.id, team1],
    [team2.id, team2],
  ]);
  const random = mulberry32(hashSeed(matchId));

  // Top performer: the real top fantasyPoints scorer if this match has any
  // revealed performance data, else a deterministic pick from the roster.
  let topPerformer: MatchInsights["topPerformer"] = null;
  if (performances.length > 0 && Number(performances[0].fantasyPoints) > 0) {
    const perf = performances[0];
    const player = allPlayers.find((p) => p.id === perf.playerId);
    if (player) {
      topPerformer = {
        name: player.name,
        teamShortName: teamById.get(player.teamId)?.shortName ?? "?",
        role: player.role,
        fantasyPoints: Number(perf.fantasyPoints),
        isReal: true,
      };
    }
  }
  if (!topPerformer && allPlayers.length > 0) {
    const pick = allPlayers[Math.floor(random() * allPlayers.length)];
    topPerformer = {
      name: pick.name,
      teamShortName: teamById.get(pick.teamId)?.shortName ?? "?",
      role: pick.role,
      fantasyPoints: Math.round(60 + random() * 60),
      isReal: false,
    };
  }

  // Top 3 picked players: ranked by real skill (a reasonable proxy for
  // popularity) with a seeded pick-percentage spread.
  const ranked = [...allPlayers].sort(
    (a, b) =>
      b.battingSkill + b.bowlingSkill - (a.battingSkill + a.bowlingSkill),
  );
  const topPlayers = ranked.slice(0, 3).map((p, i) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    teamShortName: teamById.get(p.teamId)?.shortName ?? "?",
    pickPct: Math.round(68 - i * 14 - random() * 8),
  }));

  // Bet split: skewed toward the actual match winner, like real bettor
  // behavior would trend -- 55-80% on the winning side.
  const totalBets = 40 + Math.floor(random() * 90);
  const winnerShare = 0.55 + random() * 0.25;
  const winnerBetCount = Math.round(totalBets * winnerShare);
  const loserBetCount = totalBets - winnerBetCount;
  const loserTeamId = match.winnerTeamId === team1.id ? team2.id : team1.id;
  const teamBetSplit = [
    { teamId: match.winnerTeamId, betCount: winnerBetCount },
    { teamId: loserTeamId, betCount: loserBetCount },
  ]
    .sort((a, b) => (a.teamId === team1.id ? -1 : 1))
    .map((r) => ({
      ...r,
      shortName: teamById.get(r.teamId)?.shortName ?? "?",
    }));

  const avgStakeCents = 500 + Math.floor(random() * 1500);
  const totalWageredCents = totalBets * avgStakeCents;
  const totalEntries = 8 + Math.floor(random() * 25);
  const prizePoolCents = Math.round(totalEntries * 500 * 0.85);
  const winnerPrizeCents = Math.round(prizePoolCents * (0.4 + random() * 0.15));

  return {
    totalEntries,
    totalBets,
    totalWageredCents,
    teamBetSplit,
    topPlayers,
    topPerformer,
    prizePoolCents,
    winnerWallet: fakeWallet(random),
    winnerPrizeCents,
  };
}
