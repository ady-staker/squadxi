-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "bettingFrozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bettingFrozenMessage" TEXT,
ADD COLUMN     "defaultMinEntriesToRun" INTEGER,
ADD COLUMN     "defaultRakeBps" INTEGER,
ADD COLUMN     "defaultRoleBonusBps" INTEGER,
ADD COLUMN     "maxLiveBetStakeCents" INTEGER,
ADD COLUMN     "minLiveBetStakeCents" INTEGER;
