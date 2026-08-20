-- AlterTable
ALTER TABLE "ContestEntry" ADD COLUMN     "lastEventAt" TIMESTAMP(3),
ADD COLUMN     "slotClaimed" BOOLEAN NOT NULL DEFAULT false;
