import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPoolState, totalInterestOwedWei } from "@/lib/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [loans, pool] = await Promise.all([
    prisma.loan.findMany({ orderBy: { requestedAt: "desc" } }),
    getPoolState(),
  ]);
  const userIds = [...new Set(loans.map((l) => l.borrowerUserId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  function toRow(loan: (typeof loans)[number]) {
    return {
      id: loan.id,
      borrowerName: userById.get(loan.borrowerUserId)?.displayName ?? "Unknown",
      principalWei: loan.principalWei,
      interestRateBps: loan.interestRateBps,
      termDays: loan.termDays,
      totalInterestOwedWei: totalInterestOwedWei(loan).toString(),
      status: loan.status,
      requestedAt: loan.requestedAt,
      approvedAt: loan.approvedAt,
      dueAt: loan.dueAt,
      borrowerWalletAddress: loan.borrowerWalletAddress,
      disbursedTxHash: loan.disbursedTxHash,
      repaidPrincipalWei: loan.repaidPrincipalWei,
      repaidInterestWei: loan.repaidInterestWei,
      defaultedAt: loan.defaultedAt,
    };
  }

  return NextResponse.json({
    pending: loans.filter((l) => l.status === "PENDING").map(toRow),
    active: loans.filter((l) => l.status === "ACTIVE").map(toRow),
    history: loans
      .filter((l) => !["PENDING", "ACTIVE"].includes(l.status))
      .map(toRow),
    pool,
  });
}
