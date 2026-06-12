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

  // 2. Fetch completed or cancelled matches count
  const completedOrCancelledMatchesCount = await prisma.match.count({
    where: {
      status: {
        in: ["COMPLETED", "CANCELLED"],
      },
    },
  });

  // 3. Fetch all predictions that have been calculated
  const predictions = await prisma.prediction.findMany({
    where: {
      isCalculated: true,
    },
    select: {
      userId: true,
      pointsAwarded: true,
      predictionResult: true,
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
    });
  }

  // Populate stats based on predictions
  for (const p of predictions) {
    const stats = userStatsMap.get(p.userId);
    if (!stats) continue;

    stats.submittedCount += 1;
    stats.totalPoints += p.pointsAwarded;

    if (p.predictionResult === "EXACT_SCORE") {
      stats.exactScoreCount += 1;
    } else if (p.predictionResult === "CORRECT_OUTCOME") {
      stats.correctOutcomeCount += 1;
    } else if (p.predictionResult === "WRONG") {
      stats.wrongPredictions += 1;
    }
    // Note: VOID (cancelled matches) predictions do not add to wrongPredictions or exact/correct
  }

  // Map to entries
  const entries: LeaderboardEntry[] = users.map((u) => {
    const stats = userStatsMap.get(u.id) || {
      totalPoints: 0,
      exactScoreCount: 0,
      correctOutcomeCount: 0,
      wrongPredictions: 0,
      submittedCount: 0,
    };
    const missed = completedOrCancelledMatchesCount - stats.submittedCount;
    const totalCorrect = stats.exactScoreCount + stats.correctOutcomeCount;
    const accuracy = stats.submittedCount > 0 ? (totalCorrect / stats.submittedCount) * 100 : 0;

    return {
      rank: 0, // Assigned after sorting
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      totalPoints: stats.totalPoints,
      correctOutcomeCount: stats.correctOutcomeCount,
      exactScoreCount: stats.exactScoreCount,
      wrongPredictions: stats.wrongPredictions,
      missedPredictions: missed,
      submittedCompletedCount: stats.submittedCount,
      accuracy: parseFloat(accuracy.toFixed(1)),
      createdAt: u.createdAt, // temporary for sorting
    } as any;
  });

  // Sort: Total Points descending -> Exact Score Count descending -> Correct Outcome Count descending -> Wrong Predictions ascending -> User createdAt ascending
  entries.sort((a: any, b: any) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
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
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  // Assign ranks
  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const isTie =
        prev.totalPoints === curr.totalPoints &&
        prev.exactScoreCount === curr.exactScoreCount &&
        prev.correctOutcomeCount === curr.correctOutcomeCount &&
        prev.wrongPredictions === curr.wrongPredictions;

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

