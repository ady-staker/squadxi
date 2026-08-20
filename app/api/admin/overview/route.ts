import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    totalUsers,
    matchesByStatus,
    contestsByStatus,
    entryFeeVolume,
    pendingPayouts,
    recentSignups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.match.groupBy({ by: ["status"], _count: true }),
    prisma.contest.groupBy({ by: ["status"], _count: true }),
    prisma.contestEntry.aggregate({
      where: { paymentStatus: "COMPLETED" },
      _sum: { entryFeeCents: true },
    }),
    prisma.payout.findMany({ where: { status: "PENDING" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, email: true, displayName: true, createdAt: true },
    }),
  ]);

  const matchStatusCounts: Record<string, number> = {};
  for (const row of matchesByStatus) matchStatusCounts[row.status] = row._count;
  const contestStatusCounts: Record<string, number> = {};
  for (const row of contestsByStatus) contestStatusCounts[row.status] = row._count;

  return NextResponse.json({
    totalUsers,
    matchesByStatus: matchStatusCounts,
    contestsByStatus: contestStatusCounts,
    entryFeeVolumeCents: entryFeeVolume._sum.entryFeeCents ?? 0,
    pendingPayoutCount: pendingPayouts.length,
    pendingPayoutValueCents: pendingPayouts.reduce((sum, p) => sum + p.amountOwedCents, 0),
    recentSignups,
  });
}
