import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const status = searchParams.get("status");
  const contests = await prisma.contest.findMany({
    where: {
      ...(matchId ? { matchId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ contests });
}
