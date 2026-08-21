import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Unambiguous alphabet -- no 0/O or 1/I, so an invite code is easy to read
// aloud/type without transcription errors.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
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
  const { matchId, name, entryFeeCents, maxMembers } = (body ?? {}) as {
    matchId?: unknown;
    name?: unknown;
    entryFeeCents?: unknown;
    maxMembers?: unknown;
  };

  if (typeof matchId !== "string" || matchId.length === 0) {
    return NextResponse.json(
      { error: "A match is required." },
      { status: 400 },
    );
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "A league name is required." },
      { status: 400 },
    );
  }
  const fee = entryFeeCents === undefined ? 0 : entryFeeCents;
  if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 0) {
    return NextResponse.json({ error: "Invalid entry fee." }, { status: 400 });
  }
  const max = maxMembers === undefined ? 20 : maxMembers;
  if (
    typeof max !== "number" ||
    !Number.isInteger(max) ||
    max < 2 ||
    max > 500
  ) {
    return NextResponse.json(
      { error: "Max members must be between 2 and 500." },
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
        error: "Leagues can only be created for matches that haven't started.",
      },
      { status: 409 },
    );
  }

  // Collision odds on a 6-char, 33-symbol code are astronomically low, but
  // retry a few times rather than trust a single @unique insert to always win.
  let league;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      league = await prisma.league.create({
        data: {
          name: name.trim(),
          matchId,
          creatorId: user.id,
          inviteCode: generateInviteCode(),
          entryFeeCents: fee,
          maxMembers: max,
        },
      });
      break;
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2002" &&
        attempt < 4
      ) {
        continue; // invite code collision -- try again
      }
      throw err;
    }
  }

  return NextResponse.json({ success: true, league });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const leagues = await prisma.league.findMany({
    where: matchId ? { matchId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ leagues });
}
