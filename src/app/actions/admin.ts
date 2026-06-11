"use server";

import { prisma } from "@/lib/db";
import { verifyAdminAction } from "@/lib/auth";
import { getResultFromScore, calculateMatchPoints, recalculateAllPoints } from "@/lib/scoring";
import { revalidatePath } from "next/cache";
import { Outcome, MatchStatus } from "@prisma/client";

export async function createMatch(prevState: any, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const teamA = formData.get("teamA")?.toString().trim();
  const teamB = formData.get("teamB")?.toString().trim();
  const matchTimeInput = formData.get("matchTime")?.toString();
  const predictionDeadlineInput = formData.get("predictionDeadline")?.toString();
  const group = formData.get("group")?.toString().trim() || null;
  const venue = formData.get("venue")?.toString().trim() || null;

  if (!teamA || !teamB || !matchTimeInput || !predictionDeadlineInput) {
    return { success: false, error: "All fields are required." };
  }

  const matchTime = new Date(matchTimeInput);
  const predictionDeadline = new Date(predictionDeadlineInput);

  if (isNaN(matchTime.getTime()) || isNaN(predictionDeadline.getTime())) {
    return { success: false, error: "Invalid date format." };
  }

  if (predictionDeadline > matchTime) {
    return { success: false, error: "Prediction deadline cannot be after the match start time." };
  }

  try {
    await prisma.match.create({
      data: {
        teamA,
        teamB,
        matchTime,
        predictionDeadline,
        status: MatchStatus.UPCOMING,
        group,
        venue,
        source: "Admin Panel",
        sourceUpdatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Create match error:", error);
    return { success: false, error: "Failed to create match." };
  }
}

export async function updateMatch(matchId: string, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const teamA = formData.get("teamA")?.toString().trim();
  const teamB = formData.get("teamB")?.toString().trim();
  const matchTimeInput = formData.get("matchTime")?.toString();
  const predictionDeadlineInput = formData.get("predictionDeadline")?.toString();
  const status = formData.get("status")?.toString() as MatchStatus;
  const group = formData.get("group")?.toString().trim() || null;
  const venue = formData.get("venue")?.toString().trim() || null;

  if (!teamA || !teamB || !matchTimeInput || !predictionDeadlineInput || !status) {
    return { success: false, error: "All fields are required." };
  }

  const matchTime = new Date(matchTimeInput);
  let predictionDeadline = new Date(predictionDeadlineInput);

  if (isNaN(matchTime.getTime()) || isNaN(predictionDeadline.getTime())) {
    return { success: false, error: "Invalid date format." };
  }

  // When admin enters a new matchTime for POSTPONED, predictionDeadline = new matchTime
  if (status === MatchStatus.POSTPONED) {
    predictionDeadline = matchTime;
  }

  if (predictionDeadline > matchTime) {
    return { success: false, error: "Prediction deadline cannot be after the match start time." };
  }

  try {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamA,
        teamB,
        matchTime,
        predictionDeadline,
        status,
        group,
        venue,
        source: "Admin Panel",
        sourceUpdatedAt: new Date(),
      },
    });

    // If marked as COMPLETED or CANCELLED, calculate points. Otherwise, reset them.
    if (status === MatchStatus.COMPLETED || status === MatchStatus.CANCELLED) {
      await calculateMatchPoints(matchId);
    } else {
      await prisma.prediction.updateMany({
        where: { matchId },
        data: {
          pointsAwarded: 0,
          predictionResult: null,
          isCalculated: false,
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    return { success: true };
  } catch (error) {
    console.error("Update match error:", error);
    return { success: false, error: "Failed to update match." };
  }
}

export async function deleteMatch(matchId: string) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    await prisma.match.delete({
      where: { id: matchId },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");

    return { success: true };
  } catch (error) {
    console.error("Delete match error:", error);
    return { success: false, error: "Failed to delete match." };
  }
}

export async function submitMatchResult(matchId: string, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const scoreAString = formData.get("scoreA")?.toString();
  const scoreBString = formData.get("scoreB")?.toString();
  const status = formData.get("status")?.toString() as MatchStatus;

  if (!status) {
    return { success: false, error: "Status is required." };
  }

  const scoreA = scoreAString && scoreAString.trim() !== "" ? parseInt(scoreAString) : null;
  const scoreB = scoreBString && scoreBString.trim() !== "" ? parseInt(scoreBString) : null;

  // COMPLETED requires scores
  if (status === MatchStatus.COMPLETED && (scoreA === null || scoreB === null)) {
    return { success: false, error: "Final score is required before completing a match." };
  }

  if (scoreA !== null && scoreB !== null) {
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      return { success: false, error: "Scores must be non-negative integers." };
    }
    if (scoreA > 30 || scoreB > 30) {
      return { success: false, error: "Scores cannot be greater than 30." };
    }
  }

  try {
    const result = (scoreA !== null && scoreB !== null) ? getResultFromScore(scoreA, scoreB) : null;

    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamAScore: scoreA,
        teamBScore: scoreB,
        status: status,
        result: result,
      },
    });

    // Handle points calculation based on status
    if (status === MatchStatus.COMPLETED || status === MatchStatus.CANCELLED) {
      await calculateMatchPoints(matchId);
    } else {
      // If changed to LIVE, UPCOMING, or POSTPONED, reset prediction points
      await prisma.prediction.updateMany({
        where: { matchId },
        data: {
          pointsAwarded: 0,
          predictionResult: null,
          isCalculated: false,
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    return { success: true };
  } catch (error) {
    console.error("Submit result error:", error);
    return { success: false, error: "Failed to submit result." };
  }
}

export async function triggerRecalculate() {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    await recalculateAllPoints();

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    return { success: true };
  } catch (error) {
    console.error("Recalculate error:", error);
    return { success: false, error: "Failed to recalculate points." };
  }
}
