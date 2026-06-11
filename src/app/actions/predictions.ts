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
