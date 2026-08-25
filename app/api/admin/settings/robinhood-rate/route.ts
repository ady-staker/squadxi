import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

// Scoped to this one field deliberately -- Settings also holds
// coinVoyageApiSecret/coinVoyageWebhookSecret/robinhoodOperatorPrivateKey,
// which must never round-trip through an admin API response or form.

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return NextResponse.json({
    centsPerTestnetEth: settings?.robinhoodCentsPerTestnetEth ?? null,
    contractConfigured: Boolean(settings?.robinhoodContractAddress),
  });
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
  const { centsPerTestnetEth } = (body ?? {}) as {
    centsPerTestnetEth?: unknown;
  };
  if (
    typeof centsPerTestnetEth !== "number" ||
    !Number.isInteger(centsPerTestnetEth) ||
    centsPerTestnetEth <= 0
  ) {
    return NextResponse.json(
      {
        error: "Rate must be a positive whole number of cents per testnet ETH.",
      },
      { status: 400 },
    );
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, robinhoodCentsPerTestnetEth: centsPerTestnetEth },
    update: { robinhoodCentsPerTestnetEth: centsPerTestnetEth },
  });

  return NextResponse.json({ centsPerTestnetEth });
}
