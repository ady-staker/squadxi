import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      currentEventSequence: m.currentEventSequence,
      totalEvents: m.totalEvents,
      team1Id: m.team1Id,
      team2Id: m.team2Id,
      team1: teamById.get(m.team1Id)?.shortName ?? "?",
      team2: teamById.get(m.team2Id)?.shortName ?? "?",
    })),
  });
}
