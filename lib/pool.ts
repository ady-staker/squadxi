import "server-only";
import { Prisma } from "@prisma/client";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { prisma } from "@/lib/prisma";
import {
  signClaimVoucher,
  relayClaim,
  verifyBonusClaimedOnChain,
  resolveRobinhoodConfig,
} from "@/lib/robinhood-chain";

const POOL_ID = "main";

// Virtual offset added to both sides of every share-price calculation --
// the standard ERC-4626-style guard against a first depositor manipulating
// price against whoever stakes after them (ties the pool's behavior to a
// small non-zero floor instead of a literal empty pool, which would
// otherwise let a tiny first deposit followed by a "donation" swing the
// price arbitrarily). 1000 wei is negligible next to any real stake amount.
const VIRTUAL_OFFSET = new Prisma.Decimal(1000);

function stakeWithdrawClaimId(stakePositionId: string): string {
  return keccak256(stringToHex(`stake-withdraw:${stakePositionId}`));
}

async function getOrCreatePool() {
  return prisma.loanPool.upsert({
    where: { id: POOL_ID },
    create: { id: POOL_ID },
    update: {},
  });
}

export type PoolState = {
  totalPoolValueWei: string;
  totalSharesIssued: string;
  totalLoanedWei: string;
  availableLiquidityWei: string;
  sharePrice: number; // pool value per share, informational/display only
};

/** Read-only pool snapshot for display -- current stats, current share
 *  price. sharePrice is a plain number for UI convenience; all real
 *  accounting elsewhere in this file stays in Decimal/bigint. */
export async function getPoolState(): Promise<PoolState> {
  const pool = await getOrCreatePool();
  const totalValue = new Prisma.Decimal(pool.totalPoolValueWei);
  const totalShares = pool.totalSharesIssued;
  const sharePrice = totalValue
    .plus(VIRTUAL_OFFSET)
    .dividedBy(totalShares.plus(VIRTUAL_OFFSET))
    .toNumber();
  const availableLiquidityWei = (
    BigInt(pool.totalPoolValueWei) - BigInt(pool.totalLoanedWei)
  ).toString();

  return {
    totalPoolValueWei: pool.totalPoolValueWei,
    totalSharesIssued: pool.totalSharesIssued.toString(),
    totalLoanedWei: pool.totalLoanedWei,
    availableLiquidityWei,
    sharePrice,
  };
}

/** Stakes a claimable prize into the pool instead of collecting it. Mints
 *  shares at the current price (shares = amount * (totalShares + offset) /
 *  (totalValue + offset)); no on-chain transaction happens here -- the
 *  underlying testnet ETH stays exactly where every other unclaimed prize
 *  already sits (the operator-funded RoleBonusClaim contract balance), the
 *  same trust model this app already uses for every claimable prize. */
export async function stakeIntoPool(params: {
  userId: string;
  amountWei: bigint;
  sourceContestEntryId?: string;
  sourceLiveBetId?: string;
}): Promise<{ stakePositionId: string; shares: string }> {
  if (params.amountWei <= BigInt(0)) {
    throw new Error("Stake amount must be positive.");
  }

  return prisma.$transaction(async (tx) => {
    const pool = await tx.loanPool.upsert({
      where: { id: POOL_ID },
      create: { id: POOL_ID },
      update: {},
    });
    const totalValue = new Prisma.Decimal(pool.totalPoolValueWei);
    const totalShares = pool.totalSharesIssued;
    const amount = new Prisma.Decimal(params.amountWei.toString());

    const sharesToMint = amount
      .times(totalShares.plus(VIRTUAL_OFFSET))
      .dividedBy(totalValue.plus(VIRTUAL_OFFSET));

    const position = await tx.stakePosition.create({
      data: {
        userId: params.userId,
        principalWei: params.amountWei.toString(),
        shares: sharesToMint,
        sourceContestEntryId: params.sourceContestEntryId ?? null,
        sourceLiveBetId: params.sourceLiveBetId ?? null,
      },
    });

    await tx.loanPool.update({
      where: { id: POOL_ID },
      data: {
        totalSharesIssued: totalShares.plus(sharesToMint),
        totalPoolValueWei: (
          BigInt(pool.totalPoolValueWei) + params.amountWei
        ).toString(),
      },
    });

    return { stakePositionId: position.id, shares: sharesToMint.toString() };
  });
}

/** Withdraws a stake position's full current value (no partial withdrawal
 *  in v1) -- relays a fresh claim voucher for that value the same way
 *  Collect does (see lib/robinhood-chain.ts's relayClaim), so this reuses
 *  the exact same on-chain mechanism and trust model rather than a new one.
 *  Declines outright if the pool's non-loaned liquidity can't cover it --
 *  no withdrawal queue in v1. */
export async function withdrawFromPool(params: {
  stakePositionId: string;
  userId: string;
  toAddress: Address;
}): Promise<{ txHash: Hex; valueWei: string }> {
  const position = await prisma.stakePosition.findUnique({
    where: { id: params.stakePositionId },
  });
  if (!position || position.userId !== params.userId) {
    throw new Error("Stake position not found.");
  }
  if (position.withdrawnAt) {
    throw new Error("This stake has already been withdrawn.");
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    throw new Error("The Robinhood Chain contract isn't configured yet.");
  }

  const pool = await getOrCreatePool();
  const totalValue = new Prisma.Decimal(pool.totalPoolValueWei);
  const totalShares = pool.totalSharesIssued;
  const valueDecimal = position.shares
    .times(totalValue.plus(VIRTUAL_OFFSET))
    .dividedBy(totalShares.plus(VIRTUAL_OFFSET));
  const valueWei = BigInt(valueDecimal.floor().toFixed(0));

  const availableLiquidityWei =
    BigInt(pool.totalPoolValueWei) - BigInt(pool.totalLoanedWei);
  if (valueWei > availableLiquidityWei) {
    throw new Error(
      "Pool liquidity is currently constrained by outstanding loans -- try again later.",
    );
  }

  // CAS: only the first of any concurrent withdrawal attempts on this
  // position proceeds past this point.
  const claimedSlot = await prisma.stakePosition.updateMany({
    where: { id: position.id, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (claimedSlot.count === 0) {
    throw new Error("This stake is already being withdrawn.");
  }

  const claimId = stakeWithdrawClaimId(position.id) as Hex;
  const signature = await signClaimVoucher(claimId, params.toAddress, valueWei);
  const txHash = await relayClaim(
    claimId,
    params.toAddress,
    valueWei,
    signature,
  );
  const verified = await verifyBonusClaimedOnChain(
    txHash,
    claimId,
    params.toAddress,
    valueWei,
  );
  if (!verified) {
    throw new Error("Withdrawal payout didn't verify on-chain.");
  }

  await prisma.$transaction([
    prisma.stakePosition.update({
      where: { id: position.id },
      data: { withdrawnValueWei: valueWei.toString(), withdrawTxHash: txHash },
    }),
    prisma.loanPool.update({
      where: { id: POOL_ID },
      data: {
        totalSharesIssued: totalShares.minus(position.shares),
        totalPoolValueWei: (
          BigInt(pool.totalPoolValueWei) - valueWei
        ).toString(),
      },
    }),
  ]);

  return { txHash, valueWei: valueWei.toString() };
}
