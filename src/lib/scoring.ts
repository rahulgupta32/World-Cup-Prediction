import { prisma } from "./db";
import { Outcome, PredictionResult } from "@prisma/client";

export function calculatePoints(
  predictedResult: Outcome,
  predictedTeamAScore: number | null,
  predictedTeamBScore: number | null,
  actualResult: Outcome,
  actualTeamAScore: number | null,
  actualTeamBScore: number | null,
  isCancelled: boolean = false,
  isKnockout: boolean = false,
  actualDecidedBy: string = "NORMAL_TIME",
  actualWinnerTeam: string | null = null,
  actualPenaltyTeamAScore: number | null = null,
  actualPenaltyTeamBScore: number | null = null,
  predictsPenalties: boolean = false,
  predictedPenaltyTeamAScore: number | null = null,
  predictedPenaltyTeamBScore: number | null = null,
  predictedPenaltyWinner: string | null = null
): {
  points: number;
  predictionResult: PredictionResult;
  matchScorePoints: number;
  penaltyPoints: number;
} {
  if (isCancelled) {
    return { points: 0, predictionResult: PredictionResult.VOID, matchScorePoints: 0, penaltyPoints: 0 };
  }

  const hasPredictedScores = predictedTeamAScore !== null && predictedTeamBScore !== null;
  const isExactScore =
    hasPredictedScores &&
    predictedTeamAScore === actualTeamAScore &&
    predictedTeamBScore === actualTeamBScore;

  // 1. Group Stage Matches
  if (!isKnockout) {
    if (isExactScore) {
      return {
        points: 5,
        predictionResult: PredictionResult.EXACT_SCORE,
        matchScorePoints: 5,
        penaltyPoints: 0,
      };
    }
    if (predictedResult === actualResult) {
      return {
        points: 3,
        predictionResult: PredictionResult.CORRECT_OUTCOME,
        matchScorePoints: 3,
        penaltyPoints: 0,
      };
    }
    return {
      points: 0,
      predictionResult: PredictionResult.WRONG,
      matchScorePoints: 0,
      penaltyPoints: 0,
    };
  }

  // Derived predicted winner for knockout matches
  let predictedWinner: string | null = null;
  if (predictsPenalties && predictedPenaltyWinner) {
    predictedWinner = predictedPenaltyWinner;
  } else {
    if (predictedResult === Outcome.TEAM_A) predictedWinner = "TEAM_A";
    else if (predictedResult === Outcome.TEAM_B) predictedWinner = "TEAM_B";
  }

  // 2. Knockout Matches Not Decided By Penalties
  if (actualDecidedBy !== "PENALTIES") {
    const actualWinner = actualTeamAScore! > actualTeamBScore! ? "TEAM_A" : (actualTeamAScore! < actualTeamBScore! ? "TEAM_B" : null);
    const resolvedActualWinner = actualWinnerTeam || actualWinner;

    if (isExactScore) {
      return {
        points: 5,
        predictionResult: PredictionResult.EXACT_SCORE,
        matchScorePoints: 5,
        penaltyPoints: 0,
      };
    }

    if (predictedWinner && predictedWinner === resolvedActualWinner) {
      return {
        points: 3,
        predictionResult: PredictionResult.CORRECT_OUTCOME,
        matchScorePoints: 3,
        penaltyPoints: 0,
      };
    }

    return {
      points: 0,
      predictionResult: PredictionResult.WRONG,
      matchScorePoints: 0,
      penaltyPoints: 0,
    };
  }

  // 3. Knockout Matches Decided By Penalties
  // Component A: Match score before penalties (must be exact)
  const matchScorePoints = isExactScore ? 5 : 0;

  // Component B: Penalty shootout prediction
  let penaltyPoints = 0;
  if (predictedWinner === actualWinnerTeam) {
    const hasPenaltyScores = predictedPenaltyTeamAScore !== null && predictedPenaltyTeamBScore !== null;
    const isExactPenaltyScore =
      hasPenaltyScores &&
      predictedPenaltyTeamAScore === actualPenaltyTeamAScore &&
      predictedPenaltyTeamBScore === actualPenaltyTeamBScore;

    penaltyPoints = isExactPenaltyScore ? 5 : 3;
  }

  const totalPoints = matchScorePoints + penaltyPoints;

  // Classification: EXACT_SCORE if totalPoints is 10 or 5; CORRECT_OUTCOME if 8 or 3; else WRONG
  let classification: PredictionResult = PredictionResult.WRONG;
  if (totalPoints === 10 || totalPoints === 5) {
    classification = PredictionResult.EXACT_SCORE;
  } else if (totalPoints === 8 || totalPoints === 3) {
    classification = PredictionResult.CORRECT_OUTCOME;
  }

  return {
    points: totalPoints,
    predictionResult: classification,
    matchScorePoints,
    penaltyPoints,
  };
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
        false,
        match.isKnockout,
        match.decidedBy,
        match.winnerTeam,
        match.penaltyTeamAScore,
        match.penaltyTeamBScore,
        pred.predictsPenalties,
        pred.predictedPenaltyTeamAScore,
        pred.predictedPenaltyTeamBScore,
        pred.predictedPenaltyWinner
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

