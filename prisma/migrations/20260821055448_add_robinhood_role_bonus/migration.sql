-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "roleBonusBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "robinhoodCentsPerTestnetEth" INTEGER,
ADD COLUMN     "robinhoodContractAddress" TEXT,
ADD COLUMN     "robinhoodOperatorPrivateKey" TEXT,
ADD COLUMN     "robinhoodRpcUrl" TEXT;

-- CreateTable
CREATE TABLE "RoleBonusClaim" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "contestEntryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "amountWei" TEXT NOT NULL,
    "walletAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DECLARED',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "RoleBonusClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleBonusClaim_claimId_key" ON "RoleBonusClaim"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBonusClaim_contestId_role_key" ON "RoleBonusClaim"("contestId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBonusClaim_contestId_contestEntryId_key" ON "RoleBonusClaim"("contestId", "contestEntryId");
