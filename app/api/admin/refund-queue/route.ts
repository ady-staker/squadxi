import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/** The voided-contest admin-reviewed refund queue: paid entries sitting in
 *  a VOIDED contest (below minEntriesToRun) that a human needs to look at
 *  and decide to refund -- see lib/contest-finalization.ts's doc comment on
 *  why this is a live query, not a stored "pending refund" row. */
export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const voidedContests = await prisma.contest.findMany({
    where: { status: "VOIDED" },
  });
  const voidedContestIds = voidedContests.map((c) => c.id);
  const contestById = new Map(voidedContests.map((c) => [c.id, c]));

  const entries = await prisma.contestEntry.findMany({
    where: { contestId: { in: voidedContestIds }, paymentStatus: "COMPLETED" },
    orderBy: { createdAt: "asc" },
  });

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = entries.map((e) => ({
    contestEntryId: e.id,
    displayName: userById.get(e.userId)?.displayName ?? "Unknown",
    email: userById.get(e.userId)?.email ?? null,
    contestName: e.contestId
      ? (contestById.get(e.contestId)?.name ?? null)
      : null,
    entryFeeCents: e.entryFeeCents,
    coinvoyageOrderId: e.coinvoyageOrderId,
    createdAt: e.createdAt,
  }));

  return NextResponse.json({ entries: rows });
}
