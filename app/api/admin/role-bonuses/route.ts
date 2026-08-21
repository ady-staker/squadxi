import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getContractBalance } from "@/lib/robinhood-chain";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [claims, contractBalanceWei] = await Promise.all([
    prisma.roleBonusClaim.findMany({ orderBy: { createdAt: "desc" } }),
    getContractBalance(),
  ]);

  const contestIds = [...new Set(claims.map((c) => c.contestId))];
  const entryIds = [...new Set(claims.map((c) => c.contestEntryId))];
  const playerIds = [...new Set(claims.map((c) => c.playerId))];
  const [contests, entries, players] = await Promise.all([
    prisma.contest.findMany({ where: { id: { in: contestIds } } }),
    prisma.contestEntry.findMany({ where: { id: { in: entryIds } } }),
    prisma.player.findMany({ where: { id: { in: playerIds } } }),
  ]);
  const contestById = new Map(contests.map((c) => [c.id, c]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const playerById = new Map(players.map((p) => [p.id, p]));

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    contractBalanceWei: contractBalanceWei?.toString() ?? null,
    claims: claims.map((c) => {
      const entry = entryById.get(c.contestEntryId);
      const user = entry ? userById.get(entry.userId) : undefined;
      return {
        id: c.id,
        contestName: contestById.get(c.contestId)?.name ?? null,
        role: c.role,
        playerName: playerById.get(c.playerId)?.name ?? null,
        displayName: user?.displayName ?? "Unknown",
        amountWei: c.amountWei,
        walletAddress: c.walletAddress,
        status: c.status,
        txHash: c.txHash,
        createdAt: c.createdAt,
        claimedAt: c.claimedAt,
      };
    }),
  });
}
