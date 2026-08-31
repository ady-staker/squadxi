import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPoolState } from "@/lib/pool";

export const dynamic = "force-dynamic";

// My stake positions, each with its current value at today's share price
// (not just the original principal) -- computed the same way
// withdrawFromPool does, so what's shown here matches what a withdrawal
// would actually pay out.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const [positions, pool] = await Promise.all([
    prisma.stakePosition.findMany({
      where: { userId: user.id },
      orderBy: { stakedAt: "desc" },
    }),
    getPoolState(),
  ]);

  const totalValue = new Prisma.Decimal(pool.totalPoolValueWei);
  const totalShares = new Prisma.Decimal(pool.totalSharesIssued);
  const VIRTUAL_OFFSET = new Prisma.Decimal(1000);

  const rows = positions.map((p) => {
    const currentValueWei = p.withdrawnAt
      ? null
      : p.shares
          .times(totalValue.plus(VIRTUAL_OFFSET))
          .dividedBy(totalShares.plus(VIRTUAL_OFFSET))
          .floor()
          .toFixed(0);
    return {
      id: p.id,
      principalWei: p.principalWei,
      shares: p.shares.toString(),
      currentValueWei,
      stakedAt: p.stakedAt,
      withdrawnAt: p.withdrawnAt,
      withdrawnValueWei: p.withdrawnValueWei,
      withdrawTxHash: p.withdrawTxHash,
    };
  });

  return NextResponse.json({ positions: rows });
}
