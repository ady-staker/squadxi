import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { ApiClient } from "@coin-voyage/paykit/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { coinvoyageCredentials } from "@/lib/coinvoyage";
import { BUSINESS_EMAIL, BUSINESS_NAME } from "@/lib/business";
import {
  applyContestEntryStatus,
  releaseContestSlotStandalone,
} from "@/lib/contest-fulfillment";
import {
  isFailureTerminalStatus,
  isOrderStatus,
  logUnrecognizedStatus,
} from "@/lib/order-status";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { fantasyTeamId, idempotencyKey, paymentMethod } = (body ?? {}) as {
    fantasyTeamId?: unknown;
    idempotencyKey?: unknown;
    paymentMethod?: unknown;
  };
  if (typeof fantasyTeamId !== "string" || fantasyTeamId.length === 0) {
    return NextResponse.json(
      { error: "A fantasy team is required." },
      { status: 400 },
    );
  }
  if (
    idempotencyKey !== undefined &&
    idempotencyKey !== null &&
    (typeof idempotencyKey !== "string" || idempotencyKey.length === 0)
  ) {
    return NextResponse.json(
      { error: "Invalid idempotency key." },
      { status: 400 },
    );
  }
  if (
    paymentMethod !== undefined &&
    paymentMethod !== "coinvoyage" &&
    paymentMethod !== "testnet_eth"
  ) {
    return NextResponse.json(
      { error: "Invalid payment method." },
      { status: 400 },
    );
  }

  const contestId = params.id;
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  }
  if (contest.status !== "OPEN") {
    return NextResponse.json(
      { error: "This contest is no longer open for entries." },
      { status: 409 },
    );
  }

  const fantasyTeam = await prisma.fantasyTeam.findUnique({
    where: { id: fantasyTeamId },
  });
  if (!fantasyTeam || fantasyTeam.userId !== user.id) {
    return NextResponse.json(
      { error: "Fantasy team not found." },
      { status: 404 },
    );
  }
  if (fantasyTeam.matchId !== contest.matchId) {
    return NextResponse.json(
      { error: "That team was built for a different match than this contest." },
      { status: 400 },
    );
  }

  // contestId+userId is unique at the DB level, so a user only ever has ONE
  // ContestEntry row for this contest, ever -- an unpaid or dead prior
  // attempt is resumed/switched by updating that same row, not by creating
  // a second one (which would just violate the constraint).
  const existingEntry = await prisma.contestEntry.findUnique({
    where: { contestId_userId: { contestId, userId: user.id } },
  });
  if (existingEntry && existingEntry.paymentStatus === "COMPLETED") {
    return NextResponse.json(
      { error: "You've already entered this contest." },
      { status: 409 },
    );
  }
  const resumeId = existingEntry?.id ?? null;

  // Capacity claim -- skipped when resuming an entry that already holds its
  // slot; re-claimed if a dead (EXPIRED/FAILED/REFUNDED) prior attempt had
  // already released it.
  if (!resumeId || !existingEntry!.slotClaimed) {
    const claim = await prisma.contest.updateMany({
      where: {
        id: contestId,
        status: "OPEN",
        currentEntries: { lt: contest.maxEntries },
      },
      data: { currentEntries: { increment: 1 } },
    });
    if (claim.count !== 1) {
      return NextResponse.json(
        { error: "This contest just filled up." },
        { status: 409 },
      );
    }
    if (resumeId) {
      await prisma.contestEntry.update({
        where: { id: resumeId },
        data: { slotClaimed: true },
      });
    }
  }

  // Free entry: no CoinVoyage call needed.
  if (contest.entryFeeCents === 0) {
    try {
      const entry = resumeId
        ? await prisma.contestEntry.update({
            where: { id: resumeId },
            data: {
              paymentStatus: "COMPLETED",
              coinvoyageOrderId: null,
              paymentUrl: null,
              idempotencyKey: idempotencyKey ?? null,
            },
          })
        : await prisma.contestEntry.create({
            data: {
              userId: user.id,
              contestId,
              fantasyTeamId,
              entryFeeCents: 0,
              paymentStatus: "COMPLETED",
              slotClaimed: true,
              idempotencyKey: idempotencyKey ?? null,
            },
          });
      return NextResponse.json({
        contestEntryId: entry.id,
        orderId: null,
        paymentStatus: "COMPLETED",
      });
    } catch (err) {
      if (!resumeId) await releaseContestSlotStandalone(contestId);
      if (isUniqueConstraintViolation(err)) {
        return NextResponse.json(
          { error: "You've already entered this contest." },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  // Robinhood Chain testnet ETH -- bypasses CoinVoyage entirely, chosen at
  // entry time like any other paid contest's dual payment-method choice.
  if (paymentMethod === "testnet_eth") {
    const config = await resolveRobinhoodConfig();
    if (!config.contractAddress || !config.centsPerTestnetEth) {
      if (!resumeId) await releaseContestSlotStandalone(contestId);
      return NextResponse.json(
        { error: "Robinhood Chain isn't configured yet." },
        { status: 503 },
      );
    }
    try {
      const entry = resumeId
        ? await prisma.contestEntry.update({
            where: { id: resumeId },
            data: {
              paymentStatus: "AWAITING_PAYMENT",
              coinvoyageOrderId: null,
              paymentUrl: null,
              idempotencyKey: idempotencyKey ?? null,
            },
          })
        : await prisma.contestEntry.create({
            data: {
              userId: user.id,
              contestId,
              fantasyTeamId,
              entryFeeCents: contest.entryFeeCents,
              paymentStatus: "AWAITING_PAYMENT",
              slotClaimed: true,
              idempotencyKey: idempotencyKey ?? null,
            },
          });
      return NextResponse.json({
        contestEntryId: entry.id,
        orderId: null,
        paymentStatus: "AWAITING_PAYMENT",
        testnetPayment: {
          toAddress: config.contractAddress,
          amountWei: centsToTestnetWei(
            contest.entryFeeCents,
            config.centsPerTestnetEth,
          ).toString(),
          chainId: config.chainId,
        },
      });
    } catch (err) {
      if (!resumeId) await releaseContestSlotStandalone(contestId);
      if (isUniqueConstraintViolation(err)) {
        return NextResponse.json(
          { error: "You've already entered this contest." },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  // Resuming an entry that already has a live CoinVoyage invoice on file --
  // return the same link rather than opening a second one.
  if (
    resumeId &&
    existingEntry!.coinvoyageOrderId &&
    existingEntry!.paymentUrl
  ) {
    return NextResponse.json({
      contestEntryId: existingEntry!.id,
      orderId: existingEntry!.coinvoyageOrderId,
      paymentUrl: existingEntry!.paymentUrl,
      paymentStatus: existingEntry!.paymentStatus,
    });
  }

  // Paid entry via CoinVoyage.
  let apiClient: ReturnType<typeof ApiClient>, apiSecret: string;
  try {
    ({ client: apiClient, apiSecret } = await coinvoyageCredentials());
  } catch (err) {
    if (!resumeId) await releaseContestSlotStandalone(contestId);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "CoinVoyage is not configured.",
      },
      { status: 500 },
    );
  }

  const internalEntryId = crypto.randomUUID();
  const invoiceNo = `SQX-${internalEntryId.slice(0, 8).toUpperCase()}`;
  const invoiceDate = new Date().toISOString().slice(0, 10);

  let invoice;
  try {
    const { data, error } = await apiClient.createInvoice(
      {
        invoice: { no: invoiceNo, date: invoiceDate },
        from: { name: BUSINESS_NAME, email: BUSINESS_EMAIL },
        recipient: { name: user.displayName, email: user.email },
        items: [
          {
            name: `Contest Entry — ${contest.name}`,
            unitPrice: (contest.entryFeeCents / 100).toFixed(2),
            quantity: "1",
            // Explicit "0.00" -- CoinVoyage's hosted invoice page renders
            // Tax%/Total as "NaN" when tax is omitted rather than defaulted.
            tax: "0.00",
          },
        ],
      },
      apiSecret,
    );
    if (error || !data || !data.order_id) {
      if (!resumeId) await releaseContestSlotStandalone(contestId);
      console.error(
        `createInvoice returned an error or no linked order for internalEntryId=${internalEntryId}`,
        error,
      );
      return NextResponse.json(
        {
          error:
            error?.message ?? "Failed to create your invoice with CoinVoyage.",
        },
        { status: 502 },
      );
    }
    invoice = data;
  } catch (err) {
    if (!resumeId) await releaseContestSlotStandalone(contestId);
    console.error(
      `CoinVoyage createInvoice threw for internalEntryId=${internalEntryId}`,
      err,
    );
    return NextResponse.json(
      { error: "Failed to reach CoinVoyage. Please try again." },
      { status: 502 },
    );
  }

  const linkedOrder = Array.isArray(invoice.orders)
    ? invoice.orders.find((o) => o.id === invoice.order_id)
    : undefined;
  const remoteStatus = linkedOrder?.status;
  const hasRecognizedStatus =
    typeof remoteStatus === "string" && isOrderStatus(remoteStatus);
  if (!hasRecognizedStatus && remoteStatus) {
    logUnrecognizedStatus(
      remoteStatus,
      `for coinvoyageOrderId=${invoice.order_id}`,
    );
  }
  const initialStatus = hasRecognizedStatus ? remoteStatus : "AWAITING_PAYMENT";

  let entry;
  try {
    entry = resumeId
      ? await prisma.contestEntry.update({
          where: { id: resumeId },
          data: {
            coinvoyageOrderId: invoice.order_id as string,
            paymentUrl: invoice.payment_url,
            paymentStatus: initialStatus,
            idempotencyKey: idempotencyKey ?? null,
          },
        })
      : await prisma.contestEntry.create({
          data: {
            userId: user.id,
            contestId,
            fantasyTeamId,
            entryFeeCents: contest.entryFeeCents,
            coinvoyageOrderId: invoice.order_id as string,
            paymentUrl: invoice.payment_url,
            paymentStatus: initialStatus,
            slotClaimed: true,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
  } catch (err) {
    if (!resumeId) await releaseContestSlotStandalone(contestId);

    if (isUniqueConstraintViolation(err) && idempotencyKey) {
      const winner = await prisma.contestEntry.findUnique({
        where: { idempotencyKey },
      });
      if (winner) {
        console.error(
          `Orphaned CoinVoyage invoice from a lost idempotency race: ` +
            `coinvoyageOrderId=${invoice.order_id} internalEntryId=${internalEntryId} ` +
            `idempotencyKey=${idempotencyKey} (winner: ${winner.coinvoyageOrderId})`,
        );
        return NextResponse.json({
          contestEntryId: winner.id,
          orderId: winner.coinvoyageOrderId,
          paymentUrl: winner.paymentUrl,
          paymentStatus: winner.paymentStatus,
        });
      }
    }

    console.error(
      `Orphaned CoinVoyage invoice: local ContestEntry failed to save for ` +
        `coinvoyageOrderId=${invoice.order_id} internalEntryId=${internalEntryId}`,
      err,
    );
    return NextResponse.json(
      { error: "Something went wrong saving your entry. Please try again." },
      { status: 500 },
    );
  }

  // Edge case: the linked order came back already failure-terminal (replay,
  // sandbox oddity). Nothing else will release this slot otherwise.
  if (hasRecognizedStatus && isFailureTerminalStatus(remoteStatus)) {
    try {
      await applyContestEntryStatus(entry.id, remoteStatus, new Date());
    } catch (err) {
      console.error(
        `Failed to release slot for already-terminal entry ${entry.id}`,
        err,
      );
    }
  }

  return NextResponse.json({
    contestEntryId: entry.id,
    orderId: invoice.order_id,
    paymentUrl: invoice.payment_url,
    paymentStatus: initialStatus,
  });
}
