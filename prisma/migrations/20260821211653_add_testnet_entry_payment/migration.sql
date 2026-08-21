-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "payWithTestnetEth" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContestEntry" ADD COLUMN     "testnetPaymentTxHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_testnetPaymentTxHash_key" ON "ContestEntry"("testnetPaymentTxHash");

