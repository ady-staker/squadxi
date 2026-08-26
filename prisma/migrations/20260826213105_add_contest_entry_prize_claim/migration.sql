-- AlterTable
ALTER TABLE "ContestEntry" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "claimAmountWei" TEXT,
ADD COLUMN     "claimWalletAddress" TEXT,
ADD COLUMN     "claimTxHash" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_claimId_key" ON "ContestEntry"("claimId");
