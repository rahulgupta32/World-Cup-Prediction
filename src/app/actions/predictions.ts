"use server";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isScoreConsistentWithResult } from "@/lib/scoring";
import { revalidatePath } from "next/cache";
import { Outcome } from "@prisma/client";

export async function submitPrediction(formData: FormData) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { success: false, error: "You must be logged in to submit predictions." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
  });
  if (!dbUser) {
    return { success: false, error: "User session expired or database has been re-seeded. Please log out and log back in." };
  }

  const matchId = formData.get("matchId")?.toString();
  const predictedResultInput = formData.get("predictedResult")?.toString() as Outcome | undefined;
  const scoreAString = formData.get("scoreA")?.toString();
  const scoreBString = formData.get("scoreB")?.toString();

  if (!matchId || !predictedResultInput) {
    return { success: false, error: "Invalid prediction data." };
  }

  const scoreA = scoreAString && scoreAString.trim() !== "" ? parseInt(scoreAString) : null;
  const scoreB = scoreBString && scoreBString.trim() !== "" ? parseInt(scoreBString) : null;

  // Validate scores if provided
  if ((scoreA !== null && scoreB === null) || (scoreA === null && scoreB !== null)) {
    return { success: false, error: "Please provide both scores or leave both empty." };
  }

  if (scoreA !== null && scoreB !== null) {
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      return { success: false, error: "Scores must be non-negative integers." };
    }
    if (scoreA > 20 || scoreB > 20) {
      return { success: false, error: "Predicted scores cannot be greater than 20." };
    }

    // Validate consistency
    const consistent = isScoreConsistentWithResult(scoreA, scoreB, predictedResultInput);
    if (!consistent) {
      return { 
        success: false, 
        error: `Prediction scores do not match selected result: ${
          predictedResultInput === Outcome.TEAM_A ? "Team A must win" : 
          predictedResultInput === Outcome.TEAM_B ? "Team B must win" : "Match must be a Draw"
        }.` 
      };
    }
  }

  try {
    // 1. Fetch match to verify status and deadline
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return { success: false, error: "Match not found." };
    }

    if (match.status !== "UPCOMING") {
      return { success: false, error: "Predictions are locked for this match." };
    }

    const now = new Date();
    if (now >= new Date(match.predictionDeadline)) {
      return { success: false, error: "Predictions are locked for this match." };
    }

    // 2. Save prediction (idempotent upsert) using derived session userId
    await prisma.prediction.upsert({
      where: {
        userId_matchId: {
          userId: sessionUser.userId,
          matchId: match.id,
        },
      },
      update: {
        predictedResult: predictedResultInput,
        predictedTeamAScore: scoreA,
        predictedTeamBScore: scoreB,
        updatedAt: new Date(),
      },
      create: {
        userId: sessionUser.userId,
        matchId: match.id,
        predictedResult: predictedResultInput,
        predictedTeamAScore: scoreA,
        predictedTeamBScore: scoreB,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/my-predictions");
    revalidatePath("/leaderboard");

    return { success: true };
  } catch (error) {
    console.error("Prediction submission error:", error);
    return { success: false, error: "An error occurred while saving your prediction." };
  }
}

export async function getMatchesFromDb() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { success: false, error: "Unauthorized." };
  }

  try {
    const matches = await prisma.match.findMany({
      include: {
        predictions: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { matchTime: "asc" },
    });

    const now = new Date();

    const formattedMatches = matches.map((match) => {
      const isLocked = now >= new Date(match.predictionDeadline) || match.status !== "UPCOMING";

      const userPrediction = match.predictions.find(
        (p) => p.userId === sessionUser.userId
      );

      const allowedPredictions = match.predictions.filter((p) => {
        if (p.userId === sessionUser.userId) return true;
        return isLocked;
      });

      return {
        id: match.id,
        teamA: match.teamA,
        teamB: match.teamB,
        matchTime: match.matchTime.toISOString(),
        predictionDeadline: match.predictionDeadline.toISOString(),
        status: match.status,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore,
        result: match.result,
        isLocked,
        officialMatchUrl: match.officialMatchUrl,
        officialBroadcasterUrl: match.officialBroadcasterUrl,
        liveCoverageUrl: match.liveCoverageUrl,
        broadcasterName: match.broadcasterName,
        streamSourceType: match.streamSourceType,
        lastSyncedAt: match.lastSyncedAt ? match.lastSyncedAt.toISOString() : null,
        userPrediction: userPrediction
          ? {
              id: userPrediction.id,
              userId: userPrediction.userId,
              matchId: userPrediction.matchId,
              predictedResult: userPrediction.predictedResult,
              predictedTeamAScore: userPrediction.predictedTeamAScore,
              predictedTeamBScore: userPrediction.predictedTeamBScore,
              pointsAwarded: userPrediction.pointsAwarded,
              predictionResult: userPrediction.predictionResult,
              user: { name: userPrediction.user.name },
            }
          : null,
        predictions: allowedPredictions.map((p) => ({
          id: p.id,
          userId: p.userId,
          matchId: p.matchId,
          predictedResult: p.predictedResult,
          predictedTeamAScore: p.predictedTeamAScore,
          predictedTeamBScore: p.predictedTeamBScore,
          pointsAwarded: p.pointsAwarded,
          predictionResult: p.predictionResult,
          user: { name: p.user.name },
        })),
      };
    });

    return { success: true, matches: formattedMatches };
  } catch (error) {
    console.error("Failed to fetch matches from DB:", error);
    return { success: false, error: "Failed to load matches." };
  }
}
