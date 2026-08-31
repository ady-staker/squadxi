-- AlterTable
ALTER TABLE "ContestEntry" ADD COLUMN     "stakedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LiveBet" ADD COLUMN     "stakedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LoanPool" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "totalSharesIssued" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "totalPoolValueWei" TEXT NOT NULL DEFAULT '0',
    "totalLoanedWei" TEXT NOT NULL DEFAULT '0',
    "network" TEXT NOT NULL DEFAULT 'ROBINHOOD_TESTNET',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakePosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principalWei" TEXT NOT NULL,
    "shares" DECIMAL(38,18) NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'ROBINHOOD_TESTNET',
    "sourceContestEntryId" TEXT,
    "sourceLiveBetId" TEXT,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnValueWei" TEXT,
    "withdrawTxHash" TEXT,

    CONSTRAINT "StakePosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StakePosition_sourceContestEntryId_key" ON "StakePosition"("sourceContestEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "StakePosition_sourceLiveBetId_key" ON "StakePosition"("sourceLiveBetId");

-- CreateIndex
CREATE INDEX "StakePosition_userId_idx" ON "StakePosition"("userId");
