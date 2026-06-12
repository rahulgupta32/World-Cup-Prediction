-- CreateEnum
CREATE TYPE "StreamSourceType" AS ENUM ('OFFICIAL', 'BROADCASTER', 'FIFA', 'ADMIN_LINK', 'NONE');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "apiProvider" TEXT,
ADD COLUMN "apiMatchId" TEXT,
ADD COLUMN "scoreSource" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "officialMatchUrl" TEXT,
ADD COLUMN "officialBroadcasterUrl" TEXT,
ADD COLUMN "liveCoverageUrl" TEXT,
ADD COLUMN "broadcasterName" TEXT,
ADD COLUMN "streamSourceType" "StreamSourceType" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE UNIQUE INDEX "Match_apiProvider_apiMatchId_key" ON "Match"("apiProvider", "apiMatchId");
