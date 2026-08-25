// Idempotent: creates a public contest for every LIVE/UPCOMING match that
// doesn't already have one, so a match is never stuck showing "no public
// contests" just because nobody ran the admin +Contest form for it yet.
// Safe to re-run after seeding new matches -- skips ones that already have
// a contest. Same fee/prize/rake shape as the admin contest-creation route.
import { prisma } from "../lib/prisma";

const ENTRY_FEE_CENTS = 500;
const MAX_ENTRIES = 10;
const RAKE_BPS = 1500;
const MIN_ENTRIES_TO_RUN = 3;

async function main() {
  const matches = await prisma.match.findMany({
    where: { status: { in: ["LIVE", "UPCOMING"] } },
  });
  const contests = await prisma.contest.findMany();
  const matchIdsWithContest = new Set(contests.map((c) => c.matchId));
  const missing = matches.filter((m) => !matchIdsWithContest.has(m.id));

  console.log(`Backfilling ${missing.length} contest(s)...`);
  for (const match of missing) {
    const [team1, team2] = await Promise.all([
      prisma.team.findUnique({ where: { id: match.team1Id } }),
      prisma.team.findUnique({ where: { id: match.team2Id } }),
    ]);
    const label = `${team1?.shortName ?? "?"} vs ${team2?.shortName ?? "?"}`;
    const prizePoolCents = Math.floor(
      ENTRY_FEE_CENTS * MAX_ENTRIES * (1 - RAKE_BPS / 10000),
    );
    const contest = await prisma.contest.create({
      data: {
        matchId: match.id,
        name: `${label} Public Contest`,
        entryFeeCents: ENTRY_FEE_CENTS,
        maxEntries: MAX_ENTRIES,
        prizePoolCents,
        rakeBps: RAKE_BPS,
        minEntriesToRun: MIN_ENTRIES_TO_RUN,
      },
    });
    console.log(
      `Created contest ${contest.id} for match ${match.id} (${label})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
