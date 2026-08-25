import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { resolvePlatformSettings } from "@/lib/platform-settings";

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const {
    matchId,
    name,
    entryFeeCents,
    maxEntries,
    rakeBps,
    minEntriesToRun,
    roleBonusBps,
  } = (body ?? {}) as {
    matchId?: unknown;
    name?: unknown;
    entryFeeCents?: unknown;
    maxEntries?: unknown;
    rakeBps?: unknown;
    minEntriesToRun?: unknown;
    roleBonusBps?: unknown;
  };

  if (typeof matchId !== "string" || matchId.length === 0) {
    return NextResponse.json(
      { error: "A match is required." },
      { status: 400 },
    );
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "A contest name is required." },
      { status: 400 },
    );
  }
  if (
    typeof entryFeeCents !== "number" ||
    !Number.isInteger(entryFeeCents) ||
    entryFeeCents <= 0
  ) {
    return NextResponse.json(
      { error: "Entry fee must be a positive integer (cents)." },
      { status: 400 },
    );
  }
  if (
    typeof maxEntries !== "number" ||
    !Number.isInteger(maxEntries) ||
    maxEntries < 2
  ) {
    return NextResponse.json(
      { error: "Max entries must be at least 2." },
      { status: 400 },
    );
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.status !== "UPCOMING") {
    return NextResponse.json(
      {
        error: "Contests can only be created for matches that haven't started.",
      },
      { status: 409 },
    );
  }

  const platformDefaults = await resolvePlatformSettings();
  const finalRakeBps =
    typeof rakeBps === "number" &&
    Number.isInteger(rakeBps) &&
    rakeBps >= 0 &&
    rakeBps <= 10000
      ? rakeBps
      : platformDefaults.defaultRakeBps;
  const finalMinEntries =
    typeof minEntriesToRun === "number" &&
    Number.isInteger(minEntriesToRun) &&
    minEntriesToRun >= 2
      ? minEntriesToRun
      : platformDefaults.defaultMinEntriesToRun;
  const finalRoleBonusBps =
    typeof roleBonusBps === "number" &&
    Number.isInteger(roleBonusBps) &&
    roleBonusBps >= 0 &&
    roleBonusBps <= 10000
      ? roleBonusBps
      : platformDefaults.defaultRoleBonusBps;

  const prizePoolCents = Math.floor(
    entryFeeCents * maxEntries * (1 - finalRakeBps / 10000),
  );

  const contest = await prisma.contest.create({
    data: {
      matchId,
      name: name.trim(),
      entryFeeCents,
      maxEntries,
      prizePoolCents,
      rakeBps: finalRakeBps,
      minEntriesToRun: finalMinEntries,
      roleBonusBps: finalRoleBonusBps,
    },
  });

  return NextResponse.json({ success: true, contest });
}

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const contests = await prisma.contest.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ contests });
}
