import { keccak256, stringToHex } from "viem";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyMultiplier, captaincyFor } from "@/lib/scoring";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";
import { computeMatchOdds, multiplierFor } from "@/lib/live-bet-odds";

const PRIZE_SPLIT = [0.5, 0.3, 0.2]; // top 3: 50/30/20% of the prize pool

const ROLE_BONUS_ORDER = ["WK", "BAT", "BOWL", "AR"] as const;

// Must match the contract-side derivation exactly (Phase 2/3).
function roleBonusClaimId(contestId: string, role: string): string {
  return keccak256(stringToHex(`${contestId}:${role}`));
}

// Same derivation convention as roleBonusClaimId, namespaced so a prize
// claim can never collide with a role-bonus claim -- keyed by the entry
// itself since exactly one top-3 prize claim ever exists per entry.
function contestPrizeClaimId(contestEntryId: string): string {
  return keccak256(stringToHex(`prize:${contestEntryId}`));
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

type FallbackEntry = {
  id: string;
  entryFeeCents: number;
  testnetPaymentTxHash: string | null;
  claimId: string | null;
  fantasyTeam: { captainId: string };
};

// Settles a contest that locked in below minEntriesToRun but has at least
// one paid entry, instead of voiding it. Not scored by fantasy points --
// each entry bets on its own captain's real team, at odds from the same
// engine live match-winner betting already uses. Disclosed to users at
// team-building time (components/TeamBuilder.tsx).
async function settleContestByFallback(
  contest: { id: string },
  paidEntries: FallbackEntry[],
  winnerTeamId: string,
  team1Id: string,
  team2Id: string,
  centsPerTestnetEth: number | null,
): Promise<void> {
  const odds = await computeMatchOdds(team1Id, team2Id);
  const captainIds = [
    ...new Set(paidEntries.map((e) => e.fantasyTeam.captainId)),
  ];
  const captains = await prisma.player.findMany({
    where: { id: { in: captainIds } },
    select: { id: true, teamId: true },
  });
  const captainTeamById = new Map(captains.map((p) => [p.id, p.teamId]));

  for (const entry of paidEntries) {
    const captainTeamId = captainTeamById.get(entry.fantasyTeam.captainId);
    const won = captainTeamId === winnerTeamId;
    const prizeCents = won
      ? new Prisma.Decimal(multiplierFor(odds, captainTeamId!, team1Id))
          .times(entry.entryFeeCents)
          .floor()
          .toNumber()
      : 0;

    await prisma.contestEntry.update({
      where: { id: entry.id },
      data: { rank: null, prizeCents },
    });

    if (prizeCents > 0) {
      if (entry.testnetPaymentTxHash && centsPerTestnetEth) {
        if (!entry.claimId) {
          await prisma.contestEntry.update({
            where: { id: entry.id },
            data: {
              claimId: contestPrizeClaimId(entry.id),
              claimAmountWei: centsToTestnetWei(
                prizeCents,
                centsPerTestnetEth,
              ).toString(),
            },
          });
        }
      } else {
        await prisma.payout.upsert({
          where: { contestEntryId: entry.id },
          create: {
            contestEntryId: entry.id,
            amountOwedCents: prizeCents,
            chain: null,
            token: null,
            walletAddress: null,
          },
          update: {},
        });
      }
    }
  }

  await prisma.contest.update({
    where: { id: contest.id },
    data: { status: "FINALIZED", fallbackSettled: true },
  });
}

/**
 * Finalizes every Contest tied to a match once it's COMPLETED. Only entries
 * with paymentStatus "COMPLETED" are ever eligible -- an unpaid slot-holder
 * is excluded from both the minEntriesToRun headcount and the prize pool,
 * and gets nothing refunded since it was never actually charged.
 *
 * - Zero paid entries: VOIDED, nothing to resolve. Paid entries elsewhere
 *   are never auto-refunded (admin-reviewed queue instead).
 * - 1+ paid entries below minEntriesToRun: FINALIZED via
 *   settleContestByFallback above, never voided once real money is in play.
 * - minEntriesToRun or more: FINALIZED, ranked by fantasy points, 50/30/20
 *   prize split to the top 3.
 *
 * Leagues have no rake/prize-pool structure -- just ranked for a results view.
 */
export async function finalizeMatchContests(matchId: string): Promise<void> {
  const contests = await prisma.contest.findMany({
    where: { matchId, status: "LOCKED" },
  });
  // Resolved once for the whole batch -- a testnet-ETH winner's prize
  // converts at whatever rate is live when this match finalizes, same as
  // computeRoleBonuses' own rate read below.
  const [{ centsPerTestnetEth }, match] = await Promise.all([
    resolveRobinhoodConfig(),
    prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
  ]);

  for (const contest of contests) {
    const paidEntries = await prisma.contestEntry.findMany({
      where: { contestId: contest.id, paymentStatus: "COMPLETED" },
      include: { fantasyTeam: { include: { players: true } } },
    });

    if (paidEntries.length === 0) {
      await prisma.contest.update({
        where: { id: contest.id },
        data: { status: "VOIDED" },
      });
      continue;
    }

    if (paidEntries.length < contest.minEntriesToRun) {
      // winnerTeamId is always set here -- finalize only runs on COMPLETED.
      await settleContestByFallback(
        contest,
        paidEntries,
        match.winnerTeamId!,
        match.team1Id,
        match.team2Id,
        centsPerTestnetEth,
      );
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
        const entry = ranked[i];
        // A winner whose OWN entry fee was paid in testnet ETH gets a
        // self-serve on-chain claim, same mechanism as live bets and role
        // bonuses -- no admin/manual Payout needed. Everyone else
        // (CoinVoyage-paid, or the rate is unset) still goes through the
        // manual Payout queue, since CoinVoyage has no automated payout API.
        // Never overwrites an already-issued claim/payout on a re-run.
        if (entry.testnetPaymentTxHash && centsPerTestnetEth) {
          if (!entry.claimId) {
            await prisma.contestEntry.update({
              where: { id: entry.id },
              data: {
                claimId: contestPrizeClaimId(entry.id),
                claimAmountWei: centsToTestnetWei(
                  prizeCents,
                  centsPerTestnetEth,
                ).toString(),
              },
            });
          }
        } else {
          await prisma.payout.upsert({
            where: { contestEntryId: entry.id },
            create: {
              contestEntryId: entry.id,
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
