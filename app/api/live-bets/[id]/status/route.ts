import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { coinvoyageClient } from "@/lib/coinvoyage";
import { applyLiveBetStatus } from "@/lib/live-betting";
import {
  isOrderStatus,
  isTerminalStatus,
  logUnrecognizedStatus,
} from "@/lib/order-status";

/**
 * Refresh-then-read status for a single live bet -- same fallback role as
 * app/api/contest-entries/[id]/status/route.ts, for the same reason (this
 * app's CoinVoyage webhook is unregistered as of first deploy).
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

  const bet = await prisma.liveBet.findUnique({ where: { id: params.id } });
  if (!bet || bet.userId !== user.id) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }

  if (!bet.coinvoyageOrderId || isTerminalStatus(bet.status)) {
    return NextResponse.json({ status: bet.status });
  }

  try {
    const client = await coinvoyageClient();
    const { data: order, error } = await client.getOrder(bet.coinvoyageOrderId);
    if (error || !order) {
      return NextResponse.json({ status: bet.status });
    }
    if (!isOrderStatus(order.status)) {
      logUnrecognizedStatus(order.status, `polling live bet ${bet.id}`);
      return NextResponse.json({ status: bet.status });
    }
    const applied = await applyLiveBetStatus(bet.id, order.status, new Date());
    return NextResponse.json({ status: applied });
  } catch (err) {
    console.error(`Failed to refresh status for live bet ${bet.id}`, err);
    return NextResponse.json({ status: bet.status });
  }
}
