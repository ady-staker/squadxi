import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { validateFantasyTeam, type TeamBuilderPlayer } from "@/lib/team-builder-rules";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { matchId, playerIds, captainId, viceCaptainId, name } = (body ?? {}) as {
    matchId?: unknown;
    playerIds?: unknown;
    captainId?: unknown;
    viceCaptainId?: unknown;
    name?: unknown;
  };

  if (
    typeof matchId !== "string" ||
    !Array.isArray(playerIds) ||
    !playerIds.every((id) => typeof id === "string") ||
    typeof captainId !== "string" ||
    typeof viceCaptainId !== "string"
  ) {
    return NextResponse.json({ error: "Invalid team submission." }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  // Team selection locks once a match has started -- same rule as every
  // real fantasy platform (see lib/team-builder-rules.ts's server-authority
  // note: this check, like the composition rules below, must be re-run
  // here regardless of what the client already believes).
  if (match.status !== "UPCOMING") {
    return NextResponse.json(
      { error: "Team selection is closed once a match has started." },
      { status: 409 }
    );
  }

  const rawPool = await prisma.player.findMany({
    where: { teamId: { in: [match.team1Id, match.team2Id] } },
  });
  const pool: TeamBuilderPlayer[] = rawPool.map((p) => ({
    id: p.id,
    teamId: p.teamId,
    role: p.role,
    creditValue: Number(p.creditValue),
  }));

  const result = validateFantasyTeam(pool, playerIds as string[], captainId, viceCaptainId);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid team.", details: result.errors }, { status: 400 });
  }

  const poolById = new Map(pool.map((p) => [p.id, p]));
  const totalCredits = (playerIds as string[]).reduce(
    (sum, id) => sum + (poolById.get(id)?.creditValue ?? 0),
    0
  );

  const fantasyTeam = await prisma.fantasyTeam.create({
    data: {
      userId: user.id,
      matchId,
      name: typeof name === "string" && name.trim() ? name.trim() : "My Team",
      captainId,
      viceCaptainId,
      totalCredits,
      players: {
        create: (playerIds as string[]).map((playerId) => ({ playerId })),
      },
    },
    include: { players: true },
  });

  return NextResponse.json({ success: true, fantasyTeam });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");

  const fantasyTeams = await prisma.fantasyTeam.findMany({
    where: { userId: user.id, ...(matchId ? { matchId } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ fantasyTeams });
}
