import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/** Lists all payout claims for the admin payout queue. Payout has no
 *  Prisma relation to ContestEntry (matching this repo family's Payout-model
 *  convention, see prisma/schema.prisma's comment), so entry/user/contest
 *  details are fetched separately and merged here rather than via `include`. */
export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pendingPayouts, paidPayouts] = await Promise.all([
    prisma.payout.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.payout.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" } }),
  ]);

  const allPayouts = [...pendingPayouts, ...paidPayouts];
  const entries = await prisma.contestEntry.findMany({
    where: { id: { in: allPayouts.map((p) => p.contestEntryId) } },
  });
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const contestIds = entries.map((e) => e.contestId).filter((id): id is string => Boolean(id));
  const contests = await prisma.contest.findMany({ where: { id: { in: contestIds } } });
  const contestById = new Map(contests.map((c) => [c.id, c]));

  function toRow(payout: (typeof allPayouts)[number]) {
    const entry = entryById.get(payout.contestEntryId);
    const user = entry ? userById.get(entry.userId) : undefined;
    const contest = entry?.contestId ? contestById.get(entry.contestId) : undefined;
    return {
      payoutId: payout.id,
      contestEntryId: payout.contestEntryId,
      displayName: user?.displayName ?? "Unknown",
      email: user?.email ?? null,
      contestName: contest?.name ?? null,
      rank: entry?.rank ?? null,
      amountOwedCents: payout.amountOwedCents,
      chain: payout.chain,
      token: payout.token,
      walletAddress: payout.walletAddress,
      status: payout.status,
      txNote: payout.txNote,
      createdAt: payout.createdAt,
      paidAt: payout.paidAt,
    };
  }

  return NextResponse.json({
    pending: pendingPayouts.map(toRow),
    paid: paidPayouts.map(toRow),
  });
}
