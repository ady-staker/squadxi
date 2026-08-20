import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { generateMatchEvents, type SimPlayer } from "../lib/match-simulator";
import { aggregatePerformances } from "../lib/aggregate-performance";

const prisma = new PrismaClient();

// Real teams, real players, real historical performance -- sourced from
// Cricsheet (https://cricsheet.org), an open ball-by-ball cricket data
// archive licensed under ODC-BY 1.0 (attribution required; see README and
// components/Footer.tsx). prisma/data/real-roster.json is a small derived
// dataset (not raw Cricsheet data) produced by a one-time extraction script
// (kept outside this repo): it aggregates real men's T20 international
// stats for six national squads into per-player role (WK/BAT/BOWL/AR) and
// battingSkill/bowlingSkill ratings (0-100, min-max normalized across the
// full player pool so real relative ability differences translate into a
// meaningfully different credit range -- see the extraction notes in
// README's Cricket data section for why a naive per-player formula
// compressed every real international into a near-identical, unbuildable
// credit band).
//
// What's real vs simulated, stated plainly: team names, player names, and
// skill ratings are grounded in real historical stats. Which two teams
// play on which date, and everything that happens ball-by-ball once a
// match is "live," is simulated by lib/match-simulator.ts, not a replay of
// any actual match Cricsheet recorded. There is no live/real-time data
// source in this app (see README's Money flow / Cricket data sections).
type RealRosterPlayer = {
  name: string;
  role: string;
  battingSkill: number;
  bowlingSkill: number;
};
type RealRosterTeam = {
  name: string;
  shortName: string;
  logo: string;
  players: RealRosterPlayer[];
};
const realRoster: { teams: RealRosterTeam[] } = JSON.parse(
  readFileSync(join(__dirname, "data", "real-roster.json"), "utf8")
);

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

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

const rng = mulberry32(42); // fixed seed -- only used for venue selection now, not player generation

// 5.5-10.0, correlated with the player's best real-stat-derived skill.
// Wider floor than an earlier fictional-data version (7.0-10.5) needed --
// real international regulars cluster at the high end of raw ability (see
// the extraction notes above), so every real player's *skill* value is
// already high; without a low credit floor, 11 real players would cost
// 102-114 credits against a 100-credit cap, making a valid team
// impossible to build. Verified buildable (96.5-98.1 credits for the
// cheapest valid combination) across all 15 real team pairings before
// this shipped.
function creditValueFor(battingSkill: number, bowlingSkill: number): string {
  const combined = Math.max(battingSkill, bowlingSkill);
  const credit = 5.5 + (combined / 100) * 4.5;
  return credit.toFixed(1);
}

async function main() {
  console.log("Clearing previously seeded cricket-domain rows...");
  // Dev fixture data only -- safe to wipe and regenerate on every run. Order
  // matters: children before parents (no onDelete cascade is configured).
  // ContestEntry -> FantasyTeam is a real FK (RESTRICT by default) added in
  // Phase 6, so ContestEntry must go before FantasyTeam/FantasyTeamPlayer --
  // this ordering bug was latent and harmless through every earlier reseed
  // (no ContestEntry rows existed yet at seed time), only surfacing now
  // that real test entries exist. Payout also references ContestEntry by
  // plain string id (no enforced FK, matching this repo family's Payout
  // convention), so it doesn't block deletion but is cleared here too to
  // avoid leaving orphaned rows behind.
  await prisma.payout.deleteMany({});
  await prisma.contestEntry.deleteMany({});
  await prisma.playerPerformance.deleteMany({});
  await prisma.matchEvent.deleteMany({});
  await prisma.fantasyTeamPlayer.deleteMany({});
  await prisma.fantasyTeam.deleteMany({});
  await prisma.contest.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.team.deleteMany({});

  console.log("Seeding real teams...");
  const teamRows = [];
  for (const t of realRoster.teams) {
    const team = await prisma.team.create({
      data: { name: t.name, shortName: t.shortName, logo: t.logo },
    });
    teamRows.push({ row: team, source: t });
  }

  console.log("Seeding real players...");
  const squadsByTeam = new Map<string, SimPlayer[]>();

  for (const { row: team, source } of teamRows) {
    const squad: SimPlayer[] = [];
    for (const p of source.players) {
      const player = await prisma.player.create({
        data: {
          name: p.name,
          teamId: team.id,
          role: p.role,
          creditValue: creditValueFor(p.battingSkill, p.bowlingSkill),
          battingSkill: p.battingSkill,
          bowlingSkill: p.bowlingSkill,
        },
      });
      squad.push({
        id: player.id,
        name: player.name,
        role: player.role,
        battingSkill: player.battingSkill,
        bowlingSkill: player.bowlingSkill,
      });
    }
    squadsByTeam.set(team.id, squad);
  }

  console.log("Seeding matches...");
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // [team1 index, team2 index, offsetDays from now, status] -- which real
  // teams play, and when, is a simulated schedule (see file-level comment).
  // Negative offsets = past (completed/live), positive = future (upcoming).
  const matchPlan: { t1: number; t2: number; offsetDays: number; status: "COMPLETED" | "LIVE" | "UPCOMING" }[] = [
    { t1: 0, t2: 1, offsetDays: -6, status: "COMPLETED" },
    { t1: 2, t2: 3, offsetDays: -3, status: "COMPLETED" },
    { t1: 4, t2: 5, offsetDays: 0, status: "LIVE" },
    { t1: 1, t2: 2, offsetDays: 1, status: "UPCOMING" },
    { t1: 3, t2: 4, offsetDays: 2, status: "UPCOMING" },
    { t1: 5, t2: 0, offsetDays: 3, status: "UPCOMING" },
    { t1: 0, t2: 3, offsetDays: 5, status: "UPCOMING" },
    { t1: 1, t2: 5, offsetDays: 6, status: "UPCOMING" },
    { t1: 2, t2: 4, offsetDays: 8, status: "UPCOMING" },
  ];

  const venues = [
    "Wankhede Arena", "Chinnaswamy Grounds", "Eden Fields", "Feroz Shah Stadium",
    "Chepauk Park", "Mullanpur Cricket Ground",
  ];

  for (const plan of matchPlan) {
    const team1 = teamRows[plan.t1].row;
    const team2 = teamRows[plan.t2].row;
    const scheduledAt = new Date(now + plan.offsetDays * DAY);

    const match = await prisma.match.create({
      data: {
        team1Id: team1.id,
        team2Id: team2.id,
        venue: pick(rng, venues),
        format: "T20",
        scheduledAt,
        status: plan.status === "UPCOMING" ? "UPCOMING" : plan.status === "LIVE" ? "LIVE" : "COMPLETED",
      },
    });

    if (plan.status === "UPCOMING") continue;

    const team1Squad = squadsByTeam.get(team1.id)!;
    const team2Squad = squadsByTeam.get(team2.id)!;
    const { events, winnerTeamId } = generateMatchEvents(
      match.id,
      team1.id,
      team1Squad,
      team2.id,
      team2Squad
    );

    // LIVE match: only reveal roughly the first third of the log, same as
    // where an admin might be mid-way through clicking Advance.
    const revealCount = plan.status === "LIVE" ? Math.floor(events.length / 3) : events.length;
    const revealedEvents = events.slice(0, revealCount);

    await prisma.matchEvent.createMany({
      data: events.map((e) => ({
        matchId: match.id,
        sequence: e.sequence,
        innings: e.innings,
        over: e.over,
        ballInOver: e.ballInOver,
        battingTeamId: e.battingTeamId,
        bowlingTeamId: e.bowlingTeamId,
        batsmanId: e.batsmanId,
        nonStrikerId: e.nonStrikerId,
        bowlerId: e.bowlerId,
        runsScored: e.runsScored,
        isWide: e.isWide,
        isNoBall: e.isNoBall,
        isWicket: e.isWicket,
        dismissalType: e.dismissalType,
        dismissedPlayerId: e.dismissedPlayerId,
        fielderId: e.fielderId,
        assistFielderId: e.assistFielderId,
      })),
    });

    const performances = aggregatePerformances(revealedEvents);
    for (const [playerId, perf] of performances) {
      await prisma.playerPerformance.create({
        data: {
          matchId: match.id,
          playerId,
          runs: perf.runs,
          ballsFaced: perf.ballsFaced,
          fours: perf.fours,
          sixes: perf.sixes,
          isOut: perf.isOut,
          dismissalType: perf.dismissalType,
          oversBowled: perf.oversBowled,
          runsConceded: perf.runsConceded,
          wickets: perf.wickets,
          bowledOrLbwWickets: perf.bowledOrLbwWickets,
          maidens: perf.maidens,
          catches: perf.catches,
          stumpings: perf.stumpings,
          runOutsDirect: perf.runOutsDirect,
          runOutsAssist: perf.runOutsAssist,
          // fantasyPoints recomputed by lib/scoring.ts at seed time isn't
          // done here either -- same as before, left at 0 until the first
          // admin Advance call recomputes it (see lib/live-advance.ts).
        },
      });
    }

    await prisma.match.update({
      where: { id: match.id },
      data: {
        currentEventSequence: revealCount,
        totalEvents: events.length,
        winnerTeamId: plan.status === "COMPLETED" ? winnerTeamId : null,
      },
    });

    console.log(
      `  ${team1.shortName} vs ${team2.shortName} (${plan.status}): ${revealCount}/${events.length} events revealed`
    );
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
