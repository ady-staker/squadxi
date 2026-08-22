-- AlterTable
ALTER TABLE "LiveBet" ADD COLUMN     "claimAmountWei" TEXT,
ADD COLUMN     "claimTxHash" TEXT,
ADD COLUMN     "claimWalletAddress" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3);

