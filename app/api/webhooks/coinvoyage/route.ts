import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { coinvoyageWebhookSecret } from "@/lib/coinvoyage";
import { constantTimeEqual } from "@/lib/crypto";
import { applyContestEntryStatus } from "@/lib/contest-fulfillment";
import { isOrderStatus, logUnrecognizedStatus } from "@/lib/order-status";

type WebhookPayload = {
  event: string;
  delivered_at: string;
  order: { id: string; status: string };
};

function isValidWebhookPayload(value: unknown): value is WebhookPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<WebhookPayload>;
  if (typeof v.event !== "string" || typeof v.delivered_at !== "string")
    return false;
  if (isNaN(new Date(v.delivered_at).getTime())) return false;
  if (!v.order || typeof v.order !== "object") return false;
  const order = v.order as Partial<WebhookPayload["order"]>;
  return typeof order.id === "string" && typeof order.status === "string";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("CoinVoyage-Webhook-Signature");

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = await coinvoyageWebhookSecret();
  } catch (err) {
    console.error(
      "Webhook received but COIN_VOYAGE_WEBHOOK_SECRET is not set",
      err,
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("base64");
  if (!constantTimeEqual(signatureHeader, expectedSignature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidWebhookPayload(parsed)) {
    return NextResponse.json({ received: true });
  }
  const payload = parsed;

  const entry = await prisma.contestEntry.findFirst({
    where: { coinvoyageOrderId: payload.order.id },
  });

  if (!entry) {
    // Genuinely unresolvable, or a race with POST /api/contests/[id]/enter's
    // own create (this webhook can arrive before that commits) -- 404 so
    // CoinVoyage retries; the race resolves itself within a retry or two.
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (!isOrderStatus(payload.order.status)) {
    logUnrecognizedStatus(
      payload.order.status,
      `via webhook for contest entry ${entry.id}`,
    );
    return NextResponse.json({ received: true });
  }

  try {
    const deliveredAt = new Date(payload.delivered_at);
    await applyContestEntryStatus(entry.id, payload.order.status, deliveredAt);
  } catch (err) {
    console.error(
      `Failed to apply webhook status for contest entry ${entry.id}`,
      err,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
