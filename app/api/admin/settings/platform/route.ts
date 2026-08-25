import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { resolvePlatformSettings } from "@/lib/platform-settings";

// Scoped to these fields deliberately -- same convention as
// app/api/admin/settings/robinhood-rate/route.ts. Settings also holds
// coinVoyageApiSecret/coinVoyageWebhookSecret/robinhoodOperatorPrivateKey,
// which must never round-trip through an admin API response or form.

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await resolvePlatformSettings());
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const {
    bettingFrozen,
    bettingFrozenMessage,
    defaultRakeBps,
    defaultMinEntriesToRun,
    defaultRoleBonusBps,
    minLiveBetStakeCents,
    maxLiveBetStakeCents,
  } = (body ?? {}) as {
    bettingFrozen?: unknown;
    bettingFrozenMessage?: unknown;
    defaultRakeBps?: unknown;
    defaultMinEntriesToRun?: unknown;
    defaultRoleBonusBps?: unknown;
    minLiveBetStakeCents?: unknown;
    maxLiveBetStakeCents?: unknown;
  };

  if (typeof bettingFrozen !== "boolean") {
    return NextResponse.json(
      { error: "bettingFrozen must be a boolean." },
      { status: 400 },
    );
  }
  if (
    bettingFrozenMessage !== null &&
    bettingFrozenMessage !== undefined &&
    typeof bettingFrozenMessage !== "string"
  ) {
    return NextResponse.json(
      { error: "bettingFrozenMessage must be a string." },
      { status: 400 },
    );
  }
  function isValidBps(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 10000
    );
  }
  if (!isValidBps(defaultRakeBps)) {
    return NextResponse.json(
      { error: "defaultRakeBps must be an integer between 0 and 10000 (bps)." },
      { status: 400 },
    );
  }
  if (!isValidBps(defaultRoleBonusBps)) {
    return NextResponse.json(
      {
        error:
          "defaultRoleBonusBps must be an integer between 0 and 10000 (bps).",
      },
      { status: 400 },
    );
  }
  if (
    typeof defaultMinEntriesToRun !== "number" ||
    !Number.isInteger(defaultMinEntriesToRun) ||
    defaultMinEntriesToRun < 2
  ) {
    return NextResponse.json(
      { error: "defaultMinEntriesToRun must be an integer of at least 2." },
      { status: 400 },
    );
  }
  if (
    typeof minLiveBetStakeCents !== "number" ||
    !Number.isInteger(minLiveBetStakeCents) ||
    minLiveBetStakeCents <= 0 ||
    typeof maxLiveBetStakeCents !== "number" ||
    !Number.isInteger(maxLiveBetStakeCents) ||
    maxLiveBetStakeCents <= minLiveBetStakeCents
  ) {
    return NextResponse.json(
      {
        error:
          "Live-bet stake bounds must be positive cents with max greater than min.",
      },
      { status: 400 },
    );
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      bettingFrozen,
      bettingFrozenMessage: bettingFrozenMessage || null,
      defaultRakeBps,
      defaultMinEntriesToRun,
      defaultRoleBonusBps,
      minLiveBetStakeCents,
      maxLiveBetStakeCents,
    },
    update: {
      bettingFrozen,
      bettingFrozenMessage: bettingFrozenMessage || null,
      defaultRakeBps,
      defaultMinEntriesToRun,
      defaultRoleBonusBps,
      minLiveBetStakeCents,
      maxLiveBetStakeCents,
    },
  });

  return NextResponse.json(await resolvePlatformSettings());
}
