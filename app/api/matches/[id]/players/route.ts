import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const match = await prisma.match.findUnique({ where: { id: params.id } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const [team1, team2, players] = await Promise.all([
    prisma.team.findUnique({ where: { id: match.team1Id } }),
    prisma.team.findUnique({ where: { id: match.team2Id } }),
    prisma.player.findMany({
      where: { teamId: { in: [match.team1Id, match.team2Id] } },
      orderBy: [{ teamId: "asc" }, { role: "asc" }, { creditValue: "desc" }],
    }),
  ]);

  return NextResponse.json({
    match: {
      id: match.id,
      status: match.status,
      venue: match.venue,
      format: match.format,
      scheduledAt: match.scheduledAt,
      team1: team1 ? { id: team1.id, name: team1.name, shortName: team1.shortName, logo: team1.logo } : null,
      team2: team2 ? { id: team2.id, name: team2.name, shortName: team2.shortName, logo: team2.logo } : null,
    },
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      role: p.role,
      creditValue: Number(p.creditValue),
      battingSkill: p.battingSkill,
      bowlingSkill: p.bowlingSkill,
      photo: p.photo,
    })),
  });
}
