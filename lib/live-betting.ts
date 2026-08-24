import { keccak256, stringToHex } from "viem";
import type { LiveBet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TERMINAL_ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";
import { TRANSACTION_OPTIONS } from "@/lib/contest-fulfillment";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

type RobinhoodConfig = Awaited<ReturnType<typeof resolveRobinhoodConfig>>;

function liveBetClaimId(betId: string): string {
  return keccak256(stringToHex(`livebet:${betId}`));
}

// Same deliberate exception as contest-fulfillment.ts's
// ALLOWED_POST_TERMINAL_TRANSITIONS: a completed bet can still be refunded
// afterward via the admin-reviewed queue (locked decision 6 in the live-
// betting plan -- voided bets are never auto-refunded).
const ALLOWED_POST_TERMINAL_TRANSITIONS: Partial<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  COMPLETED: ["REFUNDED"],
};

function terminalStatusesAllowingTransitionTo(
  newStatus: OrderStatus,
): OrderStatus[] {
  return (
    Object.keys(ALLOWED_POST_TERMINAL_TRANSITIONS) as OrderStatus[]
  ).filter((from) =>
    ALLOWED_POST_TERMINAL_TRANSITIONS[from]?.includes(newStatus),
  );
}

/**
 * Atomically transitions a LiveBet's status, webhook/poll-driven. Mirrors
 * lib/contest-fulfillment.ts's applyContestEntryStatus minus the slot-release
 * step -- a bet has no finite inventory to release. Same out-of-order-
 * delivery guard via lastEventAt, same terminal-transition guard.
 */
export async function applyLiveBetStatus(
  liveBetId: string,
  newStatus: OrderStatus,
  eventTimestamp: Date,
): Promise<OrderStatus> {
  const allowedFromTerminal = terminalStatusesAllowingTransitionTo(newStatus);

  // Transactional so a crash mid-refund can't leave the bet REFUNDED with
  // its Payout still PENDING and payable.
  const result = await prisma.$transaction(async (tx) => {
    await tx.liveBet.updateMany({
      where: {
        id: liveBetId,
        AND: [
          {
            OR: [
              { status: { notIn: [...TERMINAL_ORDER_STATUSES] } },
              ...(allowedFromTerminal.length > 0
                ? [{ status: { in: allowedFromTerminal } }]
                : []),
            ],
          },
          {
            OR: [
              { lastEventAt: null },
              { lastEventAt: { lt: eventTimestamp } },
            ],
          },
        ],
      },
      data: { status: newStatus, lastEventAt: eventTimestamp },
    });

    const current = await tx.liveBet.findUniqueOrThrow({
      where: { id: liveBetId },
    });

    // A refund after settlement means any Payout/claim is no longer backed
    // by real funds -- void a PENDING payout and an unclaimed claim. Never
    // touches a PAID payout or a claimed bet (money already sent).
    if (current.status === "REFUNDED") {
      await tx.payout.updateMany({
        where: { liveBetId, status: "PENDING" },
        data: { status: "VOID" },
      });
      const clearClaim =
        !current.claimedAt && (current.claimId || current.claimAmountWei);
      if (current.outcome || clearClaim) {
        await tx.liveBet.update({
          where: { id: liveBetId },
          data: {
            ...(current.outcome ? { outcome: "VOID" } : {}),
            ...(clearClaim ? { claimId: null, claimAmountWei: null } : {}),
          },
        });
      }
    }

    return current.status as OrderStatus;
  }, TRANSACTION_OPTIONS);

  if (result === "COMPLETED") {
    // Covers payment confirming after the match already finished --
    // settleLiveBets only ever runs once, at match completion.
    await settleLiveBetIfMatchAlreadyComplete(liveBetId);
  }

  return result;
}

/** Computes and persists one LiveBet's outcome. Idempotent via settledAt. */
async function settleOneLiveBet(
  bet: LiveBet,
  winnerTeamId: string,
  config: RobinhoodConfig,
): Promise<void> {
  if (bet.settledAt) return;

  const outcome = bet.sideTeamId === winnerTeamId ? "WON" : "LOST";
  // Decimal.times(), not Number(oddsMultiplier)*stakeCents -- the latter
  // hits real IEEE-754 drift (500*2.01 = 1004.9999999999999) that
  // underpays winners by a cent on many ordinary stake/odds pairs.
  const payoutCents =
    outcome === "WON"
      ? bet.oddsMultiplier.times(bet.stakeCents).floor().toNumber()
      : 0;

  // !coinvoyageOrderId is defense in depth: confirm-testnet-payment already
  // refuses a testnet confirm on a CoinVoyage bet, so a Payout and an
  // on-chain claim should never both fire for the same bet.
  const isTestnetWinner =
    outcome === "WON" &&
    payoutCents > 0 &&
    Boolean(bet.testnetPaymentTxHash) &&
    !bet.coinvoyageOrderId;

  // If the rate isn't configured, don't settle at all -- settledAt (below)
  // makes a bet permanently ineligible for re-settlement, so writing it
  // here with no claimId would strand the winner with no way to ever claim.
  if (isTestnetWinner && !config.centsPerTestnetEth) return;

  const claimAmountWei = isTestnetWinner
    ? centsToTestnetWei(
        payoutCents,
        config.centsPerTestnetEth as number,
      ).toString()
    : null;
  const claimId = claimAmountWei ? liveBetClaimId(bet.id) : null;

  // settledAt:null in the WHERE is a compare-and-swap, so a race between
  // settleLiveBets' batch pass and the late-payment catch-up can only ever
  // have one caller's updateMany actually write.
  const claimed = await prisma.liveBet.updateMany({
    where: { id: bet.id, settledAt: null },
    data: {
      outcome,
      payoutCents,
      claimId,
      claimAmountWei,
      settledAt: new Date(),
    },
  });
  if (claimed.count === 0) return;

  if (outcome === "WON" && payoutCents > 0 && bet.coinvoyageOrderId) {
    await prisma.payout.upsert({
      where: { liveBetId: bet.id },
      create: {
        liveBetId: bet.id,
        amountOwedCents: payoutCents,
        chain: null,
        token: null,
        walletAddress: null,
      },
      update: {}, // already exists (e.g. a re-run) -- don't clobber an in-progress payout
    });
  }
}

/**
 * Settles every LiveBet on a match once it reaches COMPLETED. Called from
 * lib/live-advance.ts's advanceMatch() alongside finalizeMatchContests --
 * this is the only point in the app where Match.winnerTeamId is known
 * final. Only paid bets (status COMPLETED) are ever settled, same
 * paid-only-filter discipline as finalizeMatchContests: an unpaid bet
 * never became a real wager.
 */
export async function settleLiveBets(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
  });
  if (!match.winnerTeamId) return; // shouldn't happen at COMPLETED, guard anyway

  const paidBets = await prisma.liveBet.findMany({
    where: { matchId, status: "COMPLETED", settledAt: null },
  });
  if (paidBets.length === 0) return;

  // Only needed if at least one paid bet was placed via testnet ETH -- same
  // Settings-driven conversion rate role bonuses use, resolved once per call.
  const config = await resolveRobinhoodConfig();

  for (const bet of paidBets) {
    await settleOneLiveBet(bet, match.winnerTeamId, config);
  }
}

/** Late-payment catch-up: settles one bet immediately if its match already
 *  completed before this payment confirmed. No-op if the match is still LIVE. */
export async function settleLiveBetIfMatchAlreadyComplete(
  liveBetId: string,
): Promise<void> {
  const bet = await prisma.liveBet.findUnique({ where: { id: liveBetId } });
  if (!bet || bet.status !== "COMPLETED" || bet.settledAt) return;

  const match = await prisma.match.findUnique({ where: { id: bet.matchId } });
  if (!match || match.status !== "COMPLETED" || !match.winnerTeamId) return;

  const config = await resolveRobinhoodConfig();
  await settleOneLiveBet(bet, match.winnerTeamId, config);
}
