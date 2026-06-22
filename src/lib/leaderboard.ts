import { prisma } from "./db";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  email: string;
  role: string;
  totalPoints: number;
  correctOutcomeCount: number; // Represents CORRECT_OUTCOME (+2) only
  exactScoreCount: number;      // Represents EXACT_SCORE (+5) only
  wrongPredictions: number;
  missedPredictions: number;
  submittedCompletedCount: number;
  accuracy: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  // 1. Fetch all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Fetch completed matches count only
  const completedMatchesCount = await prisma.match.count({
    where: {
      status: "COMPLETED",
    },
  });

  // 3. Fetch all predictions that have been calculated, including their match status
  const predictions = await prisma.prediction.findMany({
    where: {
      isCalculated: true,
    },
    select: {
      userId: true,
      pointsAwarded: true,
      predictionResult: true,
      match: {
        select: {
          status: true,
        },
      },
    },
  });

  // Group predictions by user
  const userStatsMap = new Map<
    string,
    {
      totalPoints: number;
      exactScoreCount: number;
      correctOutcomeCount: number;
      wrongPredictions: number;
      submittedCount: number;
      submittedCompletedCount: number;
    }
  >();

  // Initialize map for all users
  for (const u of users) {
    userStatsMap.set(u.id, {
      totalPoints: 0,
      exactScoreCount: 0,
      correctOutcomeCount: 0,
      wrongPredictions: 0,
      submittedCount: 0,
      submittedCompletedCount: 0,
    });
  }

  // Populate stats based on predictions
  for (const p of predictions) {
    const stats = userStatsMap.get(p.userId);
    if (!stats) continue;

    stats.submittedCount += 1;
    stats.totalPoints += p.pointsAwarded;

    if (p.match.status === "COMPLETED") {
      stats.submittedCompletedCount += 1;
    }

    if (p.predictionResult === "EXACT_SCORE") {
      stats.exactScoreCount += 1;
    } else if (p.predictionResult === "CORRECT_OUTCOME") {
      stats.correctOutcomeCount += 1;
    } else if (p.predictionResult === "WRONG") {
      stats.wrongPredictions += 1;
    }
  }

  // Map to entries
  const entries: LeaderboardEntry[] = users.map((u) => {
    const stats = userStatsMap.get(u.id) || {
      totalPoints: 0,
      exactScoreCount: 0,
      correctOutcomeCount: 0,
      wrongPredictions: 0,
      submittedCount: 0,
      submittedCompletedCount: 0,
    };
    
    const missedCompleted = completedMatchesCount - stats.submittedCompletedCount;
    // Calculate total points explicitly using: exact * 5 + correct * 3
    const adjustedPoints = stats.exactScoreCount * 5 + stats.correctOutcomeCount * 3;
    
    const totalCorrect = stats.exactScoreCount + stats.correctOutcomeCount;
    const accuracy = stats.submittedCompletedCount > 0 ? (totalCorrect / stats.submittedCompletedCount) * 100 : 0;

    return {
      rank: 0, // Assigned after sorting
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      totalPoints: adjustedPoints,
      correctOutcomeCount: stats.correctOutcomeCount,
      exactScoreCount: stats.exactScoreCount,
      wrongPredictions: stats.wrongPredictions,
      missedPredictions: missedCompleted,
      submittedCompletedCount: stats.submittedCompletedCount,
      accuracy: parseFloat(accuracy.toFixed(1)),
      createdAt: u.createdAt, // temporary for sorting
    } as any;
  });

  // Sort: Total Points descending -> Accuracy descending -> Exact Score Count descending -> Correct Outcome Count descending -> Wrong Predictions ascending -> Missed Predictions ascending -> User name alphabetically ascending
  entries.sort((a: any, b: any) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }
    if (b.exactScoreCount !== a.exactScoreCount) {
      return b.exactScoreCount - a.exactScoreCount;
    }
    if (b.correctOutcomeCount !== a.correctOutcomeCount) {
      return b.correctOutcomeCount - a.correctOutcomeCount;
    }
    if (a.wrongPredictions !== b.wrongPredictions) {
      return a.wrongPredictions - b.wrongPredictions;
    }
    if (a.missedPredictions !== b.missedPredictions) {
      return a.missedPredictions - b.missedPredictions;
    }
    return a.name.localeCompare(b.name);
  });

  // Assign ranks
  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const isTie =
        prev.totalPoints === curr.totalPoints &&
        prev.accuracy === curr.accuracy &&
        prev.exactScoreCount === curr.exactScoreCount &&
        prev.correctOutcomeCount === curr.correctOutcomeCount &&
        prev.wrongPredictions === curr.wrongPredictions &&
        prev.missedPredictions === curr.missedPredictions;

      if (!isTie) {
        currentRank = i + 1;
      }
    }
    entries[i].rank = currentRank;
    // Clean up sorting temp fields
    delete (entries[i] as any).createdAt;
  }

  return entries;
}

