import { PrismaClient } from "@prisma/client";
import { generateMatchEvents, type SimPlayer } from "../lib/match-simulator";
import { aggregatePerformances } from "../lib/aggregate-performance";

const prisma = new PrismaClient();

// All fictional -- no real-world team/player names or likenesses. Six
// mock franchises so a match always has two distinct teams to draw from.
const TEAMS = [
  { name: "Mumbai Marauders", shortName: "MUM", logo: "🦈" },
  { name: "Delhi Dynamos", shortName: "DEL", logo: "⚡" },
  { name: "Chennai Chargers", shortName: "CHE", logo: "🔥" },
  { name: "Punjab Panthers", shortName: "PUN", logo: "🐆" },
  { name: "Bengaluru Blazers", shortName: "BLR", logo: "🌟" },
  { name: "Kolkata Krakens", shortName: "KOL", logo: "🐙" },
];

const FIRST_NAMES = [
  "Arjun", "Vikram", "Rohan", "Karan", "Aditya", "Sanjay", "Rahul", "Nikhil",
  "Varun", "Aarav", "Dev", "Ishaan", "Kabir", "Vivaan", "Reyansh", "Yash",
  "Siddharth", "Manish", "Anand", "Suresh", "Ravi", "Ajay", "Gaurav", "Harsh",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Rao", "Menon",
  "Gupta", "Kapoor", "Malhotra", "Bhatt", "Joshi", "Chauhan", "Desai", "Pillai",
];

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

const rng = mulberry32(42); // fixed seed -- reseeding always produces the same fixture data

function randomSkill(rng: () => number, min: number, max: number): number {
  return Math.round(min + rng() * (max - min));
}

// Squad composition per team: 2 WK / 5 BAT / 5 BOWL / 3 AR = 15, satisfying
// the team-builder's role min/max (WK 1-4, BAT 3-6, BOWL 3-6, AR 1-4) with
// margin on both sides of the pool.
const ROLE_PLAN: { role: string; count: number }[] = [
  { role: "WK", count: 2 },
  { role: "BAT", count: 5 },
  { role: "BOWL", count: 5 },
  { role: "AR", count: 3 },
];

function skillsForRole(rng: () => number, role: string): { battingSkill: number; bowlingSkill: number } {
  switch (role) {
    case "WK":
      return { battingSkill: randomSkill(rng, 55, 92), bowlingSkill: randomSkill(rng, 5, 15) };
    case "BAT":
      return { battingSkill: randomSkill(rng, 60, 96), bowlingSkill: randomSkill(rng, 5, 25) };
    case "BOWL":
      return { battingSkill: randomSkill(rng, 15, 45), bowlingSkill: randomSkill(rng, 60, 96) };
    case "AR":
      return { battingSkill: randomSkill(rng, 50, 80), bowlingSkill: randomSkill(rng, 50, 80) };
    default:
      return { battingSkill: 50, bowlingSkill: 50 };
  }
}

function creditValueFor(battingSkill: number, bowlingSkill: number): string {
  const combined = Math.max(battingSkill, bowlingSkill);
  // 7.0-10.5, correlated with the player's best skill -- star players cost more.
  const credit = 7 + (combined / 100) * 3.5;
  return credit.toFixed(1);
}

async function main() {
  console.log("Seeding teams...");
  const teamRows = [];
  for (const t of TEAMS) {
    const team = await prisma.team.create({ data: t });
    teamRows.push(team);
  }

  console.log("Seeding players...");
  const usedNames = new Set<string>();
  const squadsByTeam = new Map<string, SimPlayer[]>();

  for (const team of teamRows) {
    const squad: SimPlayer[] = [];
    for (const { role, count } of ROLE_PLAN) {
      for (let i = 0; i < count; i++) {
        let name: string;
        do {
          name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
        } while (usedNames.has(name));
        usedNames.add(name);

        const { battingSkill, bowlingSkill } = skillsForRole(rng, role);
        const player = await prisma.player.create({
          data: {
            name,
            teamId: team.id,
            role,
            creditValue: creditValueFor(battingSkill, bowlingSkill),
            battingSkill,
            bowlingSkill,
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
    }
    squadsByTeam.set(team.id, squad);
  }

  console.log("Seeding matches...");
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // [team1 index, team2 index, offsetDays from now, status]
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
    const team1 = teamRows[plan.t1];
    const team2 = teamRows[plan.t2];
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
          maidens: perf.maidens,
          catches: perf.catches,
          stumpings: perf.stumpings,
          runOutsDirect: perf.runOutsDirect,
          runOutsAssist: perf.runOutsAssist,
          // fantasyPoints stays at its default (0) here -- lib/scoring.ts
          // doesn't exist yet (Phase 4). Recomputed for all seeded
          // PlayerPerformance rows once the scoring engine lands.
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
