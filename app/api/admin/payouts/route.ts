import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/** Lists all payout claims for the admin payout queue. Payout has no
 *  Prisma relation to ContestEntry/LiveBet (matching this repo family's
 *  Payout-model convention, see prisma/schema.prisma's comment), so
 *  entry/bet/user/contest details are fetched separately and merged here
 *  rather than via `include`. A Payout comes from exactly one of two
 *  sources -- contest winnings (contestEntryId) or a live-bet win
 *  (liveBetId) -- resolved and labeled distinctly below. */
export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pendingPayouts, paidPayouts] = await Promise.all([
    prisma.payout.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payout.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const allPayouts = [...pendingPayouts, ...paidPayouts];
  const entryIds = allPayouts
    .map((p) => p.contestEntryId)
    .filter((id): id is string => Boolean(id));
  const betIds = allPayouts
    .map((p) => p.liveBetId)
    .filter((id): id is string => Boolean(id));

  const [entries, bets] = await Promise.all([
    prisma.contestEntry.findMany({ where: { id: { in: entryIds } } }),
    prisma.liveBet.findMany({ where: { id: { in: betIds } } }),
  ]);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const betById = new Map(bets.map((b) => [b.id, b]));

  const userIds = [
    ...new Set([...entries.map((e) => e.userId), ...bets.map((b) => b.userId)]),
  ];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const contestIds = entries
    .map((e) => e.contestId)
    .filter((id): id is string => Boolean(id));
  const teamIds = [...new Set(bets.map((b) => b.sideTeamId))];
  const [contests, teams] = await Promise.all([
    prisma.contest.findMany({ where: { id: { in: contestIds } } }),
    prisma.team.findMany({ where: { id: { in: teamIds } } }),
  ]);
  const contestById = new Map(contests.map((c) => [c.id, c]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  function toRow(payout: (typeof allPayouts)[number]) {
    if (payout.liveBetId) {
      const bet = betById.get(payout.liveBetId);
      const user = bet ? userById.get(bet.userId) : undefined;
      const team = bet ? teamById.get(bet.sideTeamId) : undefined;
      return {
        payoutId: payout.id,
        source: "live-bet" as const,
        displayName: user?.displayName ?? "Unknown",
        email: user?.email ?? null,
        contestName: team ? `Live bet — ${team.shortName} to win` : "Live bet",
        rank: null,
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
    const entry = payout.contestEntryId
      ? entryById.get(payout.contestEntryId)
      : undefined;
    const user = entry ? userById.get(entry.userId) : undefined;
    const contest = entry?.contestId
      ? contestById.get(entry.contestId)
      : undefined;
    return {
      payoutId: payout.id,
      source: "contest" as const,
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
