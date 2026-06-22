import { prisma } from "./db";
import { Outcome, PredictionResult } from "@prisma/client";

export function calculatePoints(
  predictedResult: Outcome,
  predictedTeamAScore: number | null,
  predictedTeamBScore: number | null,
  actualResult: Outcome,
  actualTeamAScore: number | null,
  actualTeamBScore: number | null,
  isCancelled: boolean = false
): { points: number; predictionResult: PredictionResult } {
  if (isCancelled) {
    return { points: 0, predictionResult: PredictionResult.VOID };
  }

  const hasPredictedScores = predictedTeamAScore !== null && predictedTeamBScore !== null;
  const isExactScore =
    hasPredictedScores &&
    predictedTeamAScore === actualTeamAScore &&
    predictedTeamBScore === actualTeamBScore;

  if (isExactScore) {
    return { points: 5, predictionResult: PredictionResult.EXACT_SCORE };
  }

  if (predictedResult === actualResult) {
    return { points: 3, predictionResult: PredictionResult.CORRECT_OUTCOME };
  }

  return { points: 0, predictionResult: PredictionResult.WRONG };
}

// Helper to determine match result from score
export function getResultFromScore(scoreA: number, scoreB: number): Outcome {
  if (scoreA > scoreB) return Outcome.TEAM_A;
  if (scoreA < scoreB) return Outcome.TEAM_B;
  return Outcome.DRAW;
}

// Helper to validate score prediction matches result selection
export function isScoreConsistentWithResult(
  scoreA: number | null,
  scoreB: number | null,
  result: Outcome
): boolean {
  if (scoreA === null || scoreB === null) return true; // Optional score is valid
  const expectedResult = getResultFromScore(scoreA, scoreB);
  return expectedResult === result;
}

// Idempotent calculation for a single match inside a transaction
export async function calculateMatchPoints(matchId: string) {
  return await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
    });

    if (!match) return;

    // Find all predictions for this match
    const predictions = await tx.prediction.findMany({
      where: { matchId },
    });

    if (match.status === "CANCELLED") {
      // Void all predictions by setting points to 0, result to VOID, and isCalculated = true
      for (const pred of predictions) {
        await tx.prediction.update({
          where: { id: pred.id },
          data: {
            pointsAwarded: 0,
            predictionResult: PredictionResult.VOID,
            isCalculated: true,
          },
        });
      }
      return;
    }

    if (
      match.status !== "COMPLETED" ||
      match.teamAScore === null ||
      match.teamBScore === null ||
      !match.result
    ) {
      return;
    }

    // Calculate and update points for each prediction
    for (const pred of predictions) {
      const result = calculatePoints(
        pred.predictedResult,
        pred.predictedTeamAScore,
        pred.predictedTeamBScore,
        match.result,
        match.teamAScore,
        match.teamBScore,
        false
      );

      await tx.prediction.update({
        where: { id: pred.id },
        data: {
          pointsAwarded: result.points,
          predictionResult: result.predictionResult,
          isCalculated: true,
        },
      });
    }
  });
}

// Idempotent recalculation for all completed or cancelled matches
export async function recalculateAllPoints() {
  const matches = await prisma.match.findMany({
    where: {
      status: {
        in: ["COMPLETED", "CANCELLED"],
      },
    },
  });

  for (const match of matches) {
    await calculateMatchPoints(match.id);
  }
}

