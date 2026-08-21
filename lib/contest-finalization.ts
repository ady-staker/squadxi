import { keccak256, stringToHex } from "viem";
import { prisma } from "@/lib/prisma";
import { applyMultiplier, captaincyFor } from "@/lib/scoring";
import { centsToTestnetWei } from "@/lib/robinhood-chain";

const PRIZE_SPLIT = [0.5, 0.3, 0.2]; // top 3: 50/30/20% of the prize pool

const ROLE_BONUS_ORDER = ["WK", "BAT", "BOWL", "AR"] as const;

// Must match the contract-side derivation exactly (Phase 2/3).
function roleBonusClaimId(contestId: string, role: string): string {
  return keccak256(stringToHex(`${contestId}:${role}`));
}

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

type RoleBonusEntry = {
  id: string;
  createdAt: Date;
  fantasyTeam: {
    captainId: string;
    viceCaptainId: string;
    players: { playerId: string }[];
  };
};

// Best WK/BAT/BOWL/AR pick, resolved in a fixed role order so no entry wins
// twice (an already-assigned entry is excluded from later roles). "Best" =
// role's point sum within that entry's roster, same captaincy multiplier as
// FantasyTeam.totalPoints. Tie-break matches rankEntries: earlier createdAt.
function pickRoleBonusWinners(
  entries: RoleBonusEntry[],
  playerRoles: Map<string, string>,
  fantasyPointsByPlayer: Map<string, number>,
): Map<string, { contestEntryId: string; playerId: string }> {
  const winners = new Map<
    string,
    { contestEntryId: string; playerId: string }
  >();
  const usedEntryIds = new Set<string>();

  for (const role of ROLE_BONUS_ORDER) {
    let best: {
      contestEntryId: string;
      playerId: string;
      roleSum: number;
      createdAt: Date;
    } | null = null;

    for (const entry of entries) {
      if (usedEntryIds.has(entry.id)) continue;

      let roleSum = 0;
      let topPlayerId: string | null = null;
      let topPlayerPoints = -Infinity;
      for (const tp of entry.fantasyTeam.players) {
        if (playerRoles.get(tp.playerId) !== role) continue;
        const contribution = applyMultiplier(
          fantasyPointsByPlayer.get(tp.playerId) ?? 0,
          captaincyFor(
            tp.playerId,
            entry.fantasyTeam.captainId,
            entry.fantasyTeam.viceCaptainId,
          ),
        );
        roleSum += contribution;
        if (contribution > topPlayerPoints) {
          topPlayerPoints = contribution;
          topPlayerId = tp.playerId;
        }
      }
      if (topPlayerId === null) continue; // no player of this role on this roster

      if (
        !best ||
        roleSum > best.roleSum ||
        (roleSum === best.roleSum &&
          entry.createdAt.getTime() < best.createdAt.getTime())
      ) {
        best = {
          contestEntryId: entry.id,
          playerId: topPlayerId,
          roleSum,
          createdAt: entry.createdAt,
        };
      }
    }

    if (best) {
      winners.set(role, {
        contestEntryId: best.contestEntryId,
        playerId: best.playerId,
      });
      usedEntryIds.add(best.contestEntryId);
    }
  }

  return winners;
}

// Carves roleBonusBps of prizePoolCents into up to 4 RoleBonusClaim rows for
// on-chain claiming later. Returns the full nominal carve-out regardless of
// how many roles got awarded -- fewer winners just means a bigger share
// each, nothing reverts to the top-3 pool. Fails soft (returns 0) on any
// missing config so this never blocks the top-3 CoinVoyage payout below it.
async function computeRoleBonuses(
  contest: { id: string; prizePoolCents: number; roleBonusBps: number },
  paidEntries: RoleBonusEntry[],
  matchId: string,
): Promise<number> {
  if (contest.roleBonusBps <= 0) return 0;

  const roleBonusPoolCents = Math.floor(
    (contest.prizePoolCents * contest.roleBonusBps) / 10000,
  );
  if (roleBonusPoolCents <= 0) return 0;

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const centsPerEth = settings?.robinhoodCentsPerTestnetEth;
  if (!centsPerEth || centsPerEth <= 0) return 0;

  const playerIds = [
    ...new Set(
      paidEntries.flatMap((e) => e.fantasyTeam.players.map((p) => p.playerId)),
    ),
  ];
  const [players, performances] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, role: true },
    }),
    prisma.playerPerformance.findMany({
      where: { matchId, playerId: { in: playerIds } },
      select: { playerId: true, fantasyPoints: true },
    }),
  ]);
  const playerRoles = new Map(players.map((p) => [p.id, p.role]));
  const fantasyPointsByPlayer = new Map(
    performances.map((p) => [p.playerId, Number(p.fantasyPoints)]),
  );

  const winners = pickRoleBonusWinners(
    paidEntries,
    playerRoles,
    fantasyPointsByPlayer,
  );
  if (winners.size === 0) return 0;

  const perRoleCents = Math.floor(roleBonusPoolCents / winners.size);
  const amountWei = centsToTestnetWei(perRoleCents, centsPerEth);

  for (const [role, winner] of winners) {
    await prisma.roleBonusClaim.upsert({
      where: { contestId_role: { contestId: contest.id, role } },
      create: {
        contestId: contest.id,
        contestEntryId: winner.contestEntryId,
        role,
        playerId: winner.playerId,
        claimId: roleBonusClaimId(contest.id, role),
        amountWei: amountWei.toString(),
      },
      update: {}, // already exists (e.g. a re-run) -- don't clobber an in-progress claim
    });
  }

  return roleBonusPoolCents;
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
      include: { fantasyTeam: { include: { players: true } } },
    });

    if (paidEntries.length < contest.minEntriesToRun) {
      await prisma.contest.update({
        where: { id: contest.id },
        data: { status: "VOIDED" },
      });
      continue;
    }

    // Computed before PRIZE_SPLIT so the top-3 split runs against what's left.
    const roleBonusPoolCents = await computeRoleBonuses(
      contest,
      paidEntries,
      matchId,
    );
    const top3PoolCents = contest.prizePoolCents - roleBonusPoolCents;

    const ranked = rankEntries(paidEntries);

    for (let i = 0; i < ranked.length; i++) {
      const rank = i + 1;
      const shareIndex = rank - 1;
      const prizeCents =
        shareIndex < PRIZE_SPLIT.length
          ? Math.floor(top3PoolCents * PRIZE_SPLIT[shareIndex])
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
