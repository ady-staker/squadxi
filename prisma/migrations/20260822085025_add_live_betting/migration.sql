-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "liveBetId" TEXT,
ALTER COLUMN "contestEntryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LiveBet" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sideTeamId" TEXT NOT NULL,
    "stakeCents" INTEGER NOT NULL,
    "oddsMultiplier" DECIMAL(4,2) NOT NULL,
    "coinvoyageOrderId" TEXT,
    "testnetPaymentTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NONE',
    "lastEventAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "outcome" TEXT,
    "payoutCents" INTEGER NOT NULL DEFAULT 0,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "LiveBet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveBet_testnetPaymentTxHash_key" ON "LiveBet"("testnetPaymentTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBet_idempotencyKey_key" ON "LiveBet"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBet_claimId_key" ON "LiveBet"("claimId");

-- CreateIndex
CREATE INDEX "LiveBet_matchId_idx" ON "LiveBet"("matchId");

-- CreateIndex
CREATE INDEX "LiveBet_userId_idx" ON "LiveBet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_liveBetId_key" ON "Payout"("liveBetId");

