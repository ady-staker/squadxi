import "server-only";
import { Prisma } from "@prisma/client";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { prisma } from "@/lib/prisma";
import {
  signClaimVoucher,
  relayClaim,
  verifyBonusClaimedOnChain,
  verifyTestnetTransfer,
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

function loanDisbursementClaimId(loanId: string): string {
  return keccak256(stringToHex(`loan-disbursement:${loanId}`));
}

/** Flat rate over the full term, charged once -- not prorated, not
 *  compounding. Deliberately simple: a borrower's exact total repayment is
 *  principal + this, statable as one number on the transparency page. */
export function totalInterestOwedWei(loan: {
  principalWei: string;
  interestRateBps: number;
}): bigint {
  return (
    (BigInt(loan.principalWei) * BigInt(loan.interestRateBps)) / BigInt(10000)
  );
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

/** Admin-approval action: disburses an already-PENDING loan immediately via
 *  the same relayClaim mechanism as Collect/pool withdrawals -- there's no
 *  separate "approved but not yet paid out" state. Checked against
 *  Settings.loanMaxUtilizationBps so the pool can never loan out more than
 *  that fraction of its value, leaving withdrawal liquidity for stakers who
 *  aren't borrowing. totalPoolValueWei is unchanged here -- the principal
 *  is still the pool's value, just currently out on loan instead of idle
 *  (see markLoanDefaulted's comment for what happens if it's never repaid). */
export async function originateLoan(loanId: string): Promise<{ txHash: Hex }> {
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
  if (loan.status !== "PENDING") {
    throw new Error("Loan is not pending approval.");
  }
  if (!loan.borrowerWalletAddress) {
    throw new Error("No borrower wallet address on file for this loan.");
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    throw new Error("The Robinhood Chain contract isn't configured yet.");
  }

  const [pool, settings] = await Promise.all([
    getOrCreatePool(),
    prisma.settings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);
  const principalWei = BigInt(loan.principalWei);
  const totalValue = BigInt(pool.totalPoolValueWei);
  const totalLoaned = BigInt(pool.totalLoanedWei);
  const maxLoanable =
    (totalValue * BigInt(settings.loanMaxUtilizationBps)) / BigInt(10000);
  if (totalLoaned + principalWei > maxLoanable) {
    throw new Error(
      "Approving this loan would exceed the pool's max utilization.",
    );
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + loan.termDays * 24 * 60 * 60 * 1000);

  // CAS: only the first approval attempt on this loan proceeds.
  const claimedSlot = await prisma.loan.updateMany({
    where: { id: loan.id, status: "PENDING" },
    data: { status: "ACTIVE", approvedAt: now, reviewedAt: now, dueAt },
  });
  if (claimedSlot.count === 0) {
    throw new Error("This loan has already been reviewed.");
  }

  const claimId = loanDisbursementClaimId(loan.id) as Hex;
  const winner = loan.borrowerWalletAddress as Address;
  const signature = await signClaimVoucher(claimId, winner, principalWei);
  const txHash = await relayClaim(claimId, winner, principalWei, signature);
  const verified = await verifyBonusClaimedOnChain(
    txHash,
    claimId,
    winner,
    principalWei,
  );
  if (!verified) {
    throw new Error("Loan disbursement didn't verify on-chain.");
  }

  await prisma.$transaction([
    prisma.loan.update({
      where: { id: loan.id },
      data: { disbursedTxHash: txHash },
    }),
    prisma.loanPool.update({
      where: { id: POOL_ID },
      data: { totalLoanedWei: (totalLoaned + principalWei).toString() },
    }),
  ]);

  return { txHash };
}

/** Records a borrower's repayment transaction -- verified via the SAME
 *  on-chain transfer check entry fees already use (lib/robinhood-chain.ts's
 *  verifyTestnetTransfer), sent to the contract address so it actually
 *  replenishes the shared balance future claims/loans draw from. Interest
 *  paid first, then principal (standard). The interest portion is the
 *  entire mechanism by which stakers earn: it raises totalPoolValueWei,
 *  which raises share price for every current staker, automatically, with
 *  no distribution job. The principal portion only frees up totalLoanedWei
 *  -- it doesn't change totalPoolValueWei, since that principal was already
 *  counted as part of the pool's value while it was out on loan. */
export async function recordRepayment(params: {
  loanId: string;
  txHash: Hex;
  amountWei: bigint;
}): Promise<{
  principalPortionWei: string;
  interestPortionWei: string;
  loanStatus: string;
}> {
  const loan = await prisma.loan.findUniqueOrThrow({
    where: { id: params.loanId },
  });
  if (loan.status !== "ACTIVE") {
    throw new Error("Loan is not active.");
  }
  if (!loan.borrowerWalletAddress) {
    throw new Error("No borrower wallet address on file for this loan.");
  }

  const existing = await prisma.loanRepayment.findUnique({
    where: { txHash: params.txHash },
  });
  if (existing) {
    throw new Error("This repayment transaction has already been recorded.");
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    throw new Error("The Robinhood Chain contract isn't configured yet.");
  }

  const verified = await verifyTestnetTransfer(
    params.txHash,
    config.contractAddress,
    params.amountWei,
    loan.borrowerWalletAddress as Address,
  );
  if (!verified) {
    throw new Error("Couldn't verify that repayment transaction on-chain.");
  }

  const totalInterestOwed = totalInterestOwedWei(loan);
  const interestAlreadyPaid = BigInt(loan.repaidInterestWei);
  const principalAlreadyPaid = BigInt(loan.repaidPrincipalWei);
  const remainingInterest = totalInterestOwed - interestAlreadyPaid;

  const interestPortion =
    params.amountWei < remainingInterest ? params.amountWei : remainingInterest;
  const principalPortion = params.amountWei - interestPortion;

  const newRepaidInterest = interestAlreadyPaid + interestPortion;
  const newRepaidPrincipal = principalAlreadyPaid + principalPortion;
  const principalWei = BigInt(loan.principalWei);
  const isFullyRepaid =
    newRepaidPrincipal >= principalWei &&
    newRepaidInterest >= totalInterestOwed;

  await prisma.$transaction(async (tx) => {
    await tx.loanRepayment.create({
      data: {
        loanId: loan.id,
        amountWei: params.amountWei.toString(),
        principalPortionWei: principalPortion.toString(),
        interestPortionWei: interestPortion.toString(),
        txHash: params.txHash,
      },
    });
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        repaidPrincipalWei: newRepaidPrincipal.toString(),
        repaidInterestWei: newRepaidInterest.toString(),
        status: isFullyRepaid ? "REPAID" : loan.status,
      },
    });

    const pool = await tx.loanPool.upsert({
      where: { id: POOL_ID },
      create: { id: POOL_ID },
      update: {},
    });
    await tx.loanPool.update({
      where: { id: POOL_ID },
      data: {
        totalPoolValueWei: (
          BigInt(pool.totalPoolValueWei) + interestPortion
        ).toString(),
        totalLoanedWei: (
          BigInt(pool.totalLoanedWei) - principalPortion
        ).toString(),
      },
    });
  });

  return {
    principalPortionWei: principalPortion.toString(),
    interestPortionWei: interestPortion.toString(),
    loanStatus: isFullyRepaid ? "REPAID" : loan.status,
  };
}

/** Admin-triggered when a loan is never repaid -- writes off the unpaid
 *  principal against totalPoolValueWei, which drops share price for every
 *  current staker. This is the real risk staking carries, disclosed
 *  directly in the claim-page Stake UI rather than left implicit. */
export async function markLoanDefaulted(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
  if (loan.status !== "ACTIVE") {
    throw new Error("Only an active loan can be marked defaulted.");
  }

  const principalWei = BigInt(loan.principalWei);
  const principalAlreadyPaid = BigInt(loan.repaidPrincipalWei);
  const unpaidPrincipal = principalWei - principalAlreadyPaid;

  const claimedSlot = await prisma.loan.updateMany({
    where: { id: loan.id, status: "ACTIVE" },
    data: { status: "DEFAULTED", defaultedAt: new Date() },
  });
  if (claimedSlot.count === 0) {
    throw new Error("This loan is no longer active.");
  }

  if (unpaidPrincipal > BigInt(0)) {
    const pool = await getOrCreatePool();
    await prisma.loanPool.update({
      where: { id: POOL_ID },
      data: {
        totalPoolValueWei: (
          BigInt(pool.totalPoolValueWei) - unpaidPrincipal
        ).toString(),
        totalLoanedWei: (
          BigInt(pool.totalLoanedWei) - unpaidPrincipal
        ).toString(),
      },
    });
  }
}
