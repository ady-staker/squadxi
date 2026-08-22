import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { ApiClient } from "@coin-voyage/paykit/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { coinvoyageCredentials } from "@/lib/coinvoyage";
import { BUSINESS_EMAIL, BUSINESS_NAME } from "@/lib/business";
import {
  isFailureTerminalStatus,
  isOrderStatus,
  logUnrecognizedStatus,
} from "@/lib/order-status";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";
import { computeMatchOdds, multiplierFor } from "@/lib/live-bet-odds";
import { MIN_STAKE_CENTS, MAX_STAKE_CENTS } from "@/lib/live-bet-constants";

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function POST(request: Request) {
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
  const { matchId, sideTeamId, stakeCents, idempotencyKey, paymentMethod } =
    (body ?? {}) as {
      matchId?: unknown;
      sideTeamId?: unknown;
      stakeCents?: unknown;
      idempotencyKey?: unknown;
      paymentMethod?: unknown;
    };
  if (typeof matchId !== "string" || matchId.length === 0) {
    return NextResponse.json(
      { error: "A match is required." },
      { status: 400 },
    );
  }
  if (typeof sideTeamId !== "string" || sideTeamId.length === 0) {
    return NextResponse.json({ error: "A side is required." }, { status: 400 });
  }
  if (
    typeof stakeCents !== "number" ||
    !Number.isInteger(stakeCents) ||
    stakeCents < MIN_STAKE_CENTS ||
    stakeCents > MAX_STAKE_CENTS
  ) {
    return NextResponse.json(
      {
        error: `Stake must be between $${(MIN_STAKE_CENTS / 100).toFixed(2)} and $${(MAX_STAKE_CENTS / 100).toFixed(2)}.`,
      },
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

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.status !== "LIVE") {
    return NextResponse.json(
      { error: "Betting is only open while a match is live." },
      { status: 409 },
    );
  }
  if (sideTeamId !== match.team1Id && sideTeamId !== match.team2Id) {
    return NextResponse.json(
      { error: "That team isn't playing in this match." },
      { status: 400 },
    );
  }

  // Idempotent replay: a retried/duplicate submission returns the original
  // bet instead of creating a second one.
  if (idempotencyKey) {
    const existing = await prisma.liveBet.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        !isOrderStatus(existing.status) ||
        !isFailureTerminalStatus(existing.status)
      ) {
        return NextResponse.json({
          liveBetId: existing.id,
          orderId: existing.coinvoyageOrderId,
          status: existing.status,
        });
      }
      // Dead attempt (EXPIRED/FAILED/REFUNDED) -- free the key and fall
      // through to create a fresh bet, same as the contest-entry pattern.
      await prisma.liveBet.update({
        where: { id: existing.id },
        data: { idempotencyKey: null },
      });
    }
  }

  const odds = await computeMatchOdds(match.team1Id, match.team2Id);
  const oddsMultiplier = multiplierFor(odds, sideTeamId, match.team1Id);

  // Robinhood Chain testnet ETH -- same dual-payment-method choice already
  // available on contest entries (app/api/contests/[id]/enter/route.ts),
  // reused verbatim here.
  if (paymentMethod === "testnet_eth") {
    const config = await resolveRobinhoodConfig();
    if (!config.contractAddress || !config.centsPerTestnetEth) {
      return NextResponse.json(
        { error: "Robinhood Chain isn't configured yet." },
        { status: 503 },
      );
    }
    try {
      const bet = await prisma.liveBet.create({
        data: {
          matchId,
          userId: user.id,
          sideTeamId,
          stakeCents,
          oddsMultiplier,
          status: "AWAITING_PAYMENT",
          idempotencyKey: idempotencyKey ?? null,
        },
      });
      return NextResponse.json({
        liveBetId: bet.id,
        orderId: null,
        status: "AWAITING_PAYMENT",
        oddsMultiplier,
        testnetPayment: {
          toAddress: config.contractAddress,
          amountWei: centsToTestnetWei(
            stakeCents,
            config.centsPerTestnetEth,
          ).toString(),
          chainId: config.chainId,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return NextResponse.json(
          { error: "That request was already submitted." },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  // CoinVoyage.
  let apiClient: ReturnType<typeof ApiClient>, apiSecret: string;
  try {
    ({ client: apiClient, apiSecret } = await coinvoyageCredentials());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "CoinVoyage is not configured.",
      },
      { status: 500 },
    );
  }

  const internalBetId = crypto.randomUUID();
  const invoiceNo = `SQXB-${internalBetId.slice(0, 8).toUpperCase()}`;
  const invoiceDate = new Date().toISOString().slice(0, 10);

  const sideTeam = await prisma.team.findUnique({ where: { id: sideTeamId } });

  let invoice;
  try {
    const { data, error } = await apiClient.createInvoice(
      {
        invoice: { no: invoiceNo, date: invoiceDate },
        from: { name: BUSINESS_NAME, email: BUSINESS_EMAIL },
        recipient: { name: user.displayName, email: user.email },
        items: [
          {
            name: `Live Bet — ${sideTeam?.shortName ?? "Team"} to win`,
            unitPrice: (stakeCents / 100).toFixed(2),
            quantity: "1",
            tax: "0.00",
          },
        ],
      },
      apiSecret,
    );
    if (error || !data || !data.order_id) {
      console.error(
        `createInvoice returned an error or no linked order for internalBetId=${internalBetId}`,
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
    console.error(
      `CoinVoyage createInvoice threw for internalBetId=${internalBetId}`,
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

  let bet;
  try {
    bet = await prisma.liveBet.create({
      data: {
        matchId,
        userId: user.id,
        sideTeamId,
        stakeCents,
        oddsMultiplier,
        coinvoyageOrderId: invoice.order_id as string,
        status: initialStatus,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err) && idempotencyKey) {
      const winner = await prisma.liveBet.findUnique({
        where: { idempotencyKey },
      });
      if (winner) {
        console.error(
          `Orphaned CoinVoyage invoice from a lost idempotency race: ` +
            `coinvoyageOrderId=${invoice.order_id} internalBetId=${internalBetId} ` +
            `idempotencyKey=${idempotencyKey} (winner: ${winner.coinvoyageOrderId})`,
        );
        return NextResponse.json({
          liveBetId: winner.id,
          orderId: winner.coinvoyageOrderId,
          status: winner.status,
        });
      }
    }
    console.error(
      `Orphaned CoinVoyage invoice: local LiveBet failed to save for ` +
        `coinvoyageOrderId=${invoice.order_id} internalBetId=${internalBetId}`,
      err,
    );
    return NextResponse.json(
      { error: "Something went wrong saving your bet. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    liveBetId: bet.id,
    orderId: invoice.order_id,
    paymentUrl: invoice.payment_url,
    status: initialStatus,
    oddsMultiplier,
  });
}
