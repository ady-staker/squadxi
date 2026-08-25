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
import { resolvePlatformSettings } from "@/lib/platform-settings";

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

  const platformSettings = await resolvePlatformSettings();
  if (platformSettings.bettingFrozen) {
    return NextResponse.json(
      {
        error:
          platformSettings.bettingFrozenMessage ??
          "Joining leagues is temporarily paused. Please check back soon.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { inviteCode, fantasyTeamId } = (body ?? {}) as {
    inviteCode?: unknown;
    fantasyTeamId?: unknown;
  };
  if (typeof inviteCode !== "string" || inviteCode.trim().length === 0) {
    return NextResponse.json(
      { error: "An invite code is required." },
      { status: 400 },
    );
  }
  if (typeof fantasyTeamId !== "string" || fantasyTeamId.length === 0) {
    return NextResponse.json(
      { error: "A fantasy team is required." },
      { status: 400 },
    );
  }

  const league = await prisma.league.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
  });
  if (!league) {
    return NextResponse.json(
      { error: "Invalid invite code." },
      { status: 404 },
    );
  }
  if (league.status !== "OPEN") {
    return NextResponse.json(
      { error: "This league is no longer open to new members." },
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
  if (fantasyTeam.matchId !== league.matchId) {
    return NextResponse.json(
      { error: "That team was built for a different match than this league." },
      { status: 400 },
    );
  }

  const existingEntry = await prisma.contestEntry.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
  });
  if (existingEntry) {
    return NextResponse.json(
      { error: "You've already joined this league." },
      { status: 409 },
    );
  }

  // Non-atomic capacity check -- acceptable here (unlike Contest's atomic
  // currentEntries counter) since private leagues are joined by a handful of
  // invited friends, not under meaningful concurrency. A League has no
  // currentEntries counter to reserve/release, so there's nothing to
  // compensate on a later failure below -- the ContestEntry row simply never
  // gets created.
  const memberCount = await prisma.contestEntry.count({
    where: { leagueId: league.id },
  });
  if (memberCount >= league.maxMembers) {
    return NextResponse.json(
      { error: "This league is full." },
      { status: 409 },
    );
  }

  if (league.entryFeeCents === 0) {
    try {
      const entry = await prisma.contestEntry.create({
        data: {
          userId: user.id,
          leagueId: league.id,
          fantasyTeamId,
          entryFeeCents: 0,
          paymentStatus: "COMPLETED",
        },
      });
      return NextResponse.json({
        contestEntryId: entry.id,
        orderId: null,
        paymentStatus: "COMPLETED",
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return NextResponse.json(
          { error: "You've already joined this league." },
          { status: 409 },
        );
      }
      throw err;
    }
  }

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
            name: `League Entry — ${league.name}`,
            unitPrice: (league.entryFeeCents / 100).toFixed(2),
            quantity: "1",
            tax: "0.00",
          },
        ],
      },
      apiSecret,
    );
    if (error || !data || !data.order_id) {
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
    entry = await prisma.contestEntry.create({
      data: {
        userId: user.id,
        leagueId: league.id,
        fantasyTeamId,
        entryFeeCents: league.entryFeeCents,
        coinvoyageOrderId: invoice.order_id as string,
        paymentStatus: initialStatus,
      },
    });
  } catch (err) {
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

  if (hasRecognizedStatus && isFailureTerminalStatus(remoteStatus)) {
    // No counter to release for a League (unlike Contest) -- the ContestEntry
    // row's own paymentStatus already reflects the dead state, which is all
    // that matters here (nothing reserved capacity on this row's behalf).
  }

  return NextResponse.json({
    contestEntryId: entry.id,
    orderId: invoice.order_id,
    paymentUrl: invoice.payment_url,
    paymentStatus: initialStatus,
  });
}
