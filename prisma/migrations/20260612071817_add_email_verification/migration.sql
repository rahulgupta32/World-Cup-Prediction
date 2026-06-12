-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "matchDateKey" TEXT,
ADD COLUMN     "normalizedTeamA" TEXT,
ADD COLUMN     "normalizedTeamB" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verificationEmailLastSentAt" TIMESTAMP(3),
ADD COLUMN     "verificationToken" TEXT,
ADD COLUMN     "verificationTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Match_normalizedTeamA_normalizedTeamB_matchDateKey_idx" ON "Match"("normalizedTeamA", "normalizedTeamB", "matchDateKey");
