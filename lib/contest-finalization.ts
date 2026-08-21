import { prisma } from "@/lib/prisma";

const PRIZE_SPLIT = [0.5, 0.3, 0.2]; // top 3: 50/30/20% of the prize pool

/** Closes entries on every OPEN Contest/League tied to a match -- called
 *  once a match's first Advance click moves it UPCOMING -> LIVE. LOCKED
 *  contests/leagues are rejected by the existing status !== "OPEN" checks
 *  in the enter/join routes, so this is the only place that transition
 *  needs to happen. */
export async function lockEntriesForMatch(matchId: string): Promise<void> {
  await prisma.contest.updateMany({
    where: { matchId, status: "OPEN" },
    data: { status: "LOCKED" },
  });
  await prisma.league.updateMany({
    where: { matchId, status: "OPEN" },
    data: { status: "LOCKED" },
  });
}

/** Ranks a set of ContestEntrys by their FantasyTeam.totalPoints (already
 *  final at this point -- the match is COMPLETED). Ties break on earlier
 *  entry (createdAt ascending) -- a deterministic, simple rule; this app
 *  doesn't split a prize between tied entries, each tie-broken rank gets
 *  its own full prize tier. */
function rankEntries<
  T extends {
    id: string;
    createdAt: Date;
    fantasyTeam: { totalPoints: unknown };
  },
>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const diff =
      Number(b.fantasyTeam.totalPoints) - Number(a.fantasyTeam.totalPoints);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Finalizes every Contest tied to a match once it's COMPLETED. Only entries
 * with paymentStatus "COMPLETED" (or free entries, entryFeeCents 0, which
 * are marked COMPLETED immediately at entry time) are ever eligible here --
 * an entry that claimed a slot but never actually finished paying (still
 * PENDING/AWAITING_PAYMENT/etc. when the match ends) is treated as absent:
 * excluded from both the minEntriesToRun headcount and the ranking/prize
 * pool. It was never actually charged, so there's nothing to refund either --
 * it simply never became a real contestant. This matters for real money:
 * ranking by claimed-slot count alone (Contest.currentEntries) would let an
 * unpaid entry both inflate a contest past its minimum and potentially win
 * a real prize it never paid into.
 *
 * - Below minEntriesToRun *paid* entries: VOIDED. Paid entries are
 *   deliberately NOT auto-refunded (locked decision: refunds are
 *   admin-reviewed, not automatic -- CoinVoyage's refund API has never been
 *   exercised for real anywhere in this workspace). The admin refund queue
 *   (Phase 8) finds these by querying VOIDED contests' COMPLETED-payment
 *   entries directly -- no separate "pending refund" row needed, that
 *   combination of contest status + entry paymentStatus already identifies
 *   exactly what needs review.
 * - Otherwise: FINALIZED. Ranks every paid entry, splits the prize pool
 *   50/30/20 to the top 3, creates a Payout row per prize-winning entry
 *   (skipped for prizeCents === 0, i.e. every entry outside the top 3).
 *
 * Leagues have no rake/prize-pool structure in this app (creator-defined,
 * ad-hoc) -- they're just ranked and marked COMPLETED for a results view.
 */
export async function finalizeMatchContests(matchId: string): Promise<void> {
  const contests = await prisma.contest.findMany({
    where: { matchId, status: "LOCKED" },
  });

  for (const contest of contests) {
    const paidEntries = await prisma.contestEntry.findMany({
      where: { contestId: contest.id, paymentStatus: "COMPLETED" },
      include: { fantasyTeam: true },
    });

    if (paidEntries.length < contest.minEntriesToRun) {
      await prisma.contest.update({
        where: { id: contest.id },
        data: { status: "VOIDED" },
      });
      continue;
    }

    const ranked = rankEntries(paidEntries);

    for (let i = 0; i < ranked.length; i++) {
      const rank = i + 1;
      const shareIndex = rank - 1;
      const prizeCents =
        shareIndex < PRIZE_SPLIT.length
          ? Math.floor(contest.prizePoolCents * PRIZE_SPLIT[shareIndex])
          : 0;

      await prisma.contestEntry.update({
        where: { id: ranked[i].id },
        data: { rank, prizeCents },
      });

      if (prizeCents > 0) {
        await prisma.payout.upsert({
          where: { contestEntryId: ranked[i].id },
          create: {
            contestEntryId: ranked[i].id,
            amountOwedCents: prizeCents,
            // null until the winner provides these -- see the Payout
            // model's doc comment on why this app's Payout rows can be
            // born without them, unlike coinflip-site's.
            chain: null,
            token: null,
            walletAddress: null,
          },
          update: {}, // already exists (e.g. a re-run) -- don't clobber an in-progress payout
        });
      }
    }

    await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "FINALIZED" },
    });
  }

  const leagues = await prisma.league.findMany({
    where: { matchId, status: "LOCKED" },
  });
  for (const league of leagues) {
    // Same paid-only filter as contests above -- a member who never
    // finished paying a paid league's entry fee shouldn't appear ranked.
    const entries = await prisma.contestEntry.findMany({
      where: { leagueId: league.id, paymentStatus: "COMPLETED" },
      include: { fantasyTeam: true },
    });
    const ranked = rankEntries(entries);
    for (let i = 0; i < ranked.length; i++) {
      await prisma.contestEntry.update({
        where: { id: ranked[i].id },
        data: { rank: i + 1 },
      });
    }
    await prisma.league.update({
      where: { id: league.id },
      data: { status: "COMPLETED" },
    });
  }
}
