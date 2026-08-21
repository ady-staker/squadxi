import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { coinvoyageClient } from "@/lib/coinvoyage";
import { applyContestEntryStatus } from "@/lib/contest-fulfillment";
import {
  isOrderStatus,
  isTerminalStatus,
  logUnrecognizedStatus,
} from "@/lib/order-status";

/**
 * Refresh-then-read status for a single contest entry -- the fallback that
 * lets a paid entry's status ever move past PENDING/AWAITING_PAYMENT
 * without a registered CoinVoyage webhook (this app's own webhook secret is
 * still unregistered as of first deploy, see README's Deployment section).
 * Polled client-side by the "Complete payment" flow in components/MatchHub.tsx,
 * same refresh-then-apply shape as dental-site's order-status poll route.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const entry = await prisma.contestEntry.findUnique({
    where: { id: params.id },
  });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json(
      { error: "Contest entry not found." },
      { status: 404 },
    );
  }

  if (!entry.coinvoyageOrderId || isTerminalStatus(entry.paymentStatus)) {
    return NextResponse.json({ paymentStatus: entry.paymentStatus });
  }

  try {
    const client = await coinvoyageClient();
    const { data: order, error } = await client.getOrder(
      entry.coinvoyageOrderId,
    );
    if (error || !order) {
      // Transient lookup failure -- report the last-known local status
      // rather than erroring the poll; the next poll tries again.
      return NextResponse.json({ paymentStatus: entry.paymentStatus });
    }
    if (!isOrderStatus(order.status)) {
      logUnrecognizedStatus(order.status, `polling contest entry ${entry.id}`);
      return NextResponse.json({ paymentStatus: entry.paymentStatus });
    }
    const applied = await applyContestEntryStatus(
      entry.id,
      order.status,
      new Date(),
    );
    return NextResponse.json({ paymentStatus: applied });
  } catch (err) {
    console.error(
      `Failed to refresh status for contest entry ${entry.id}`,
      err,
    );
    return NextResponse.json({ paymentStatus: entry.paymentStatus });
  }
}
