import { prisma } from "@/lib/prisma";
import {
  isFailureTerminalStatus,
  TERMINAL_ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/order-status";

// Shared by the contest-entry route's same-request compensating release and
// this file's webhook/poll-driven release, so the two paths can't drift.
export const TRANSACTION_OPTIONS = { timeout: 15000, maxWait: 10000 };

// Same deliberate exception as the sibling apps' order-fulfillment.ts: a
// completed entry can still be refunded afterward (admin refund action, or
// the voided-contest admin-reviewed refund queue), and that must release the
// contest slot it claimed.
const ALLOWED_POST_TERMINAL_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  COMPLETED: ["REFUNDED"],
};

function terminalStatusesAllowingTransitionTo(newStatus: OrderStatus): OrderStatus[] {
  return (Object.keys(ALLOWED_POST_TERMINAL_TRANSITIONS) as OrderStatus[]).filter(
    (from) => ALLOWED_POST_TERMINAL_TRANSITIONS[from]?.includes(newStatus)
  );
}

/** Releases one claimed slot on a Contest (decrements currentEntries),
 *  gated on ContestEntry.slotClaimed true -> false so this is safe to call
 *  more than once for the same entry (a rejected/no-op status transition
 *  observed as already-terminal, a retried webhook, etc.) without
 *  double-releasing the same slot -- mirrors dental-site's
 *  `stockReserved: true -> false` claim-then-act guard. */
async function releaseContestSlot(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  contestEntryId: string,
  contestId: string
): Promise<void> {
  const claim = await tx.contestEntry.updateMany({
    where: { id: contestEntryId, slotClaimed: true },
    data: { slotClaimed: false },
  });
  if (claim.count !== 1) return; // already released by an earlier call

  const result = await tx.contest.updateMany({
    where: { id: contestId, currentEntries: { gt: 0 } },
    data: { currentEntries: { decrement: 1 } },
  });
  if (result.count === 0) {
    console.error(`releaseContestSlot: contest ${contestId} currentEntries already 0.`);
  }
}

/** Compensating release for a slot claimed earlier in the *same request*
 *  that then failed before any ContestEntry row was ever created (e.g.
 *  CoinVoyage createInvoice itself errored) -- there's no row yet to gate a
 *  slotClaimed flag on, so this is a direct decrement. Single-invocation,
 *  same request: no retry/race concerns here, unlike applyContestEntryStatus's
 *  webhook/poll-driven release above. Failures are logged, not thrown --
 *  every caller is already inside a catch block reporting its own error, and
 *  letting a release failure propagate would abort that reporting entirely. */
export async function releaseContestSlotStandalone(contestId: string): Promise<void> {
  try {
    const result = await prisma.contest.updateMany({
      where: { id: contestId, currentEntries: { gt: 0 } },
      data: { currentEntries: { decrement: 1 } },
    });
    if (result.count === 0) {
      console.error(`releaseContestSlotStandalone: contest ${contestId} currentEntries already 0.`);
    }
  } catch (err) {
    console.error(`Failed to release contest slot for ${contestId}`, err);
  }
}

/**
 * Atomically transitions a ContestEntry's paymentStatus and, in the same
 * transaction, releases its claimed contest slot exactly once if (and only
 * if) the resulting status is failure-terminal. Mirrors dental-site's
 * lib/order-fulfillment.ts::applyOrderStatus -- same out-of-order-delivery
 * guard via lastEventAt, same terminal-transition guard, same reasoning for
 * why both the status write and the release live in one transaction. See
 * that file's comments for the full rationale.
 *
 * A no-op for free entries (contestId null or entryFeeCents 0, which never
 * get a coinvoyageOrderId in the first place) -- nothing calls this for them.
 */
export async function applyContestEntryStatus(
  contestEntryId: string,
  newStatus: OrderStatus,
  eventTimestamp: Date
): Promise<OrderStatus> {
  const allowedFromTerminal = terminalStatusesAllowingTransitionTo(newStatus);

  return prisma.$transaction(async (tx) => {
    await tx.contestEntry.updateMany({
      where: {
        id: contestEntryId,
        AND: [
          {
            OR: [
              { paymentStatus: { notIn: [...TERMINAL_ORDER_STATUSES] } },
              ...(allowedFromTerminal.length > 0
                ? [{ paymentStatus: { in: allowedFromTerminal } }]
                : []),
            ],
          },
          { OR: [{ lastEventAt: null }, { lastEventAt: { lt: eventTimestamp } }] },
        ],
      },
      data: {
        paymentStatus: newStatus,
        lastEventAt: eventTimestamp,
      },
    });

    const current = await tx.contestEntry.findUniqueOrThrow({ where: { id: contestEntryId } });
    const persistedStatus = current.paymentStatus as OrderStatus;

    if (current.contestId && isFailureTerminalStatus(persistedStatus)) {
      await releaseContestSlot(tx, current.id, current.contestId);
    }

    return persistedStatus;
  }, TRANSACTION_OPTIONS);
}
