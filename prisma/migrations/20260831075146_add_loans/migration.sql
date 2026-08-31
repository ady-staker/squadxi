-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "loanInterestRateBps" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "loanTermDaysDefault" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "loanMaxPrincipalWei" TEXT NOT NULL DEFAULT '10000000000000000',
ADD COLUMN     "loanMaxUtilizationBps" INTEGER NOT NULL DEFAULT 8000;

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "borrowerUserId" TEXT NOT NULL,
    "principalWei" TEXT NOT NULL,
    "interestRateBps" INTEGER NOT NULL,
    "termDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "borrowerWalletAddress" TEXT,
    "disbursedTxHash" TEXT,
    "repaidPrincipalWei" TEXT NOT NULL DEFAULT '0',
    "repaidInterestWei" TEXT NOT NULL DEFAULT '0',
    "defaultedAt" TIMESTAMP(3),
    "network" TEXT NOT NULL DEFAULT 'ROBINHOOD_TESTNET',

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amountWei" TEXT NOT NULL,
    "principalPortionWei" TEXT NOT NULL,
    "interestPortionWei" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loan_borrowerUserId_idx" ON "Loan"("borrowerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_txHash_key" ON "LoanRepayment"("txHash");

-- CreateIndex
CREATE INDEX "LoanRepayment_loanId_idx" ON "LoanRepayment"("loanId");
