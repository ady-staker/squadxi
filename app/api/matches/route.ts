import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const matches = await prisma.match.findMany({
    orderBy: { scheduledAt: "asc" },
  });
  const teamIds = [...new Set(matches.flatMap((m) => [m.team1Id, m.team2Id]))];
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } } });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return NextResponse.json({
    matches: matches.map((m) => ({
      id: m.id,
      status: m.status,
      venue: m.venue,
      format: m.format,
      scheduledAt: m.scheduledAt,
      team1: teamById.get(m.team1Id) ?? null,
      team2: teamById.get(m.team2Id) ?? null,
    })),
  });
}
