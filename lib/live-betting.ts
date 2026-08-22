import { keccak256, stringToHex } from "viem";
import { prisma } from "@/lib/prisma";
import { TERMINAL_ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

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

  await prisma.liveBet.updateMany({
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
          OR: [{ lastEventAt: null }, { lastEventAt: { lt: eventTimestamp } }],
        },
      ],
    },
    data: { status: newStatus, lastEventAt: eventTimestamp },
  });

  const current = await prisma.liveBet.findUniqueOrThrow({
    where: { id: liveBetId },
  });
  return current.status as OrderStatus;
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
    where: { matchId, status: "COMPLETED" },
  });
  if (paidBets.length === 0) return;

  // Only needed if at least one paid bet was placed via testnet ETH -- same
  // Settings-driven conversion rate role bonuses use, resolved once per call.
  const config = await resolveRobinhoodConfig();

  for (const bet of paidBets) {
    const outcome = bet.sideTeamId === match.winnerTeamId ? "WON" : "LOST";
    const payoutCents =
      outcome === "WON"
        ? Math.floor(bet.stakeCents * Number(bet.oddsMultiplier))
        : 0;

    const isTestnetWinner =
      outcome === "WON" && payoutCents > 0 && Boolean(bet.testnetPaymentTxHash);
    const claimId = isTestnetWinner ? liveBetClaimId(bet.id) : null;
    const claimAmountWei =
      isTestnetWinner && config.centsPerTestnetEth
        ? centsToTestnetWei(payoutCents, config.centsPerTestnetEth).toString()
        : null;

    await prisma.liveBet.update({
      where: { id: bet.id },
      data: {
        outcome,
        payoutCents,
        claimId,
        claimAmountWei,
        settledAt: new Date(),
      },
    });

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
}
