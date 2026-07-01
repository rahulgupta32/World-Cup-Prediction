-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "penaltyTeamAScore" INTEGER,
ADD COLUMN     "penaltyTeamBScore" INTEGER;

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "predictedPenaltyTeamAScore" INTEGER,
ADD COLUMN     "predictedPenaltyTeamBScore" INTEGER,
ADD COLUMN     "predictedPenaltyWinner" TEXT,
ADD COLUMN     "predictsPenalties" BOOLEAN NOT NULL DEFAULT false;
