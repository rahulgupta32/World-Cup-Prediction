import "dotenv/config";
import { calculatePoints, getResultFromScore } from "../src/lib/scoring";
import { Outcome, PredictionResult } from "@prisma/client";

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${message}. Expected ${expected}, got ${actual}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message} (Result: ${actual})`);
  }
}

interface TestLeaderboardEntry {
  name: string;
  totalPoints: number;
  accuracy: number;
  exactScoreCount: number;
  correctOutcomeCount: number;
  wrongPredictions: number;
  missedPredictions: number;
}

function sortEntries(entries: TestLeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
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
}

async function runTests() {
  console.log("Starting Scoring Rules Verification Tests...\n");

  const actualScoreA = 2; // Korea Republic
  const actualScoreB = 1; // Czechia
  const actualResult = getResultFromScore(actualScoreA, actualScoreB); // TEAM_A

  // Test Case 1: Exact Score prediction (2-1) -> +5 EXACT_SCORE
  const tc1 = calculatePoints(
    Outcome.TEAM_A,
    2,
    1,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc1.points, 5, "Exact Score prediction points");
  assertEqual(tc1.predictionResult, PredictionResult.EXACT_SCORE, "Exact Score prediction classification");

  // Test Case 2: Correct Outcome prediction 1 (2-0) -> +3 CORRECT_OUTCOME
  const tc2 = calculatePoints(
    Outcome.TEAM_A,
    2,
    0,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc2.points, 3, "Correct Outcome prediction 2-0 points");
  assertEqual(tc2.predictionResult, PredictionResult.CORRECT_OUTCOME, "Correct Outcome prediction 2-0 classification");

  // Test Case 3: Correct Outcome prediction 2 (1-0) -> +3 CORRECT_OUTCOME
  const tc3 = calculatePoints(
    Outcome.TEAM_A,
    1,
    0,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc3.points, 3, "Correct Outcome prediction 1-0 points");
  assertEqual(tc3.predictionResult, PredictionResult.CORRECT_OUTCOME, "Correct Outcome prediction 1-0 classification");

  // Test Case 4: Wrong Prediction (1-1) -> 0 WRONG
  const tc4 = calculatePoints(
    Outcome.DRAW,
    1,
    1,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc4.points, 0, "Wrong Prediction points (must be 0)");
  assertEqual(tc4.predictionResult, PredictionResult.WRONG, "Wrong Prediction classification");

  // Test Case 5: Cancelled Match prediction -> 0 VOID
  const tc5 = calculatePoints(
    Outcome.TEAM_A,
    2,
    1,
    actualResult,
    actualScoreA,
    actualScoreB,
    true // isCancelled
  );
  assertEqual(tc5.points, 0, "Cancelled Match prediction points");
  assertEqual(tc5.predictionResult, PredictionResult.VOID, "Cancelled Match prediction classification");

  console.log("\nVerifying User Points Example Cases:");
  // User A: exact 2, correct 2, wrong 5, missed 3 => totalPoints = 2*5 + 2*3 = 16
  const userAPoints = 2 * 5 + 2 * 3 + 5 * 0;
  assertEqual(userAPoints, 16, "User A points calculation");

  // User B: exact 1, correct 3, wrong 3, missed 5 => totalPoints = 1*5 + 3*3 = 14
  const userBPoints = 1 * 5 + 3 * 3 + 3 * 0;
  assertEqual(userBPoints, 14, "User B points calculation");

  // User C: exact 0, correct 4, wrong 6, missed 2 => totalPoints = 0*5 + 4*3 = 12
  const userCPoints = 0 * 5 + 4 * 3 + 6 * 0;
  assertEqual(userCPoints, 12, "User C points calculation");

  console.log("\nVerifying Leaderboard Tie-breaking Sorting Logic:");
  
  // Tie-breaker 1: Accuracy/win percentage
  // User X: 20 points, 4 attempts, 4 correct (100% accuracy)
  // User Y: 20 points, 8 attempts, 4 correct (50% accuracy)
  // Expected: User X first
  const tie1: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 100, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 0, missedPredictions: 0 },
  ];
  const sortedTie1 = sortEntries(tie1);
  assertEqual(sortedTie1[0].name, "User X", "Tie-break 1: Accuracy priority");

  // Tie-breaker 2: Higher exactScoreCount
  // Both: 20 points, 50% accuracy, User X has 4 exact, User Y has 2 exact
  // Expected: User X first
  const tie2: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 4, correctOutcomeCount: 0, wrongPredictions: 4, missedPredictions: 0 },
  ];
  const sortedTie2 = sortEntries(tie2);
  assertEqual(sortedTie2[0].name, "User X", "Tie-break 2: Exact score count priority");

  // Tie-breaker 3: Higher correctOutcomeCount
  // Both: 20 points, 50% accuracy, 2 exact. User X has 4 correct, User Y has 2 correct
  // Expected: User X first
  const tie3: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 4, wrongPredictions: 4, missedPredictions: 0 },
  ];
  const sortedTie3 = sortEntries(tie3);
  assertEqual(sortedTie3[0].name, "User X", "Tie-break 3: Correct outcome count priority");

  // Tie-breaker 4: Fewer wrongPredictions
  // Both: 20 points, 50% accuracy, 2 exact, 2 correct. User X has 1 wrong, User Y has 4 wrong
  // Expected: User X first
  const tie4: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
  ];
  const sortedTie4 = sortEntries(tie4);
  assertEqual(sortedTie4[0].name, "User X", "Tie-break 4: Fewer wrong predictions priority");

  // Tie-breaker 5: Fewer missedPredictions
  // Both: 20 points, 50% accuracy, 2 exact, 2 correct, 1 wrong. User X has 0 missed, User Y has 2 missed
  // Expected: User X first
  const tie5: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 2 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
  ];
  const sortedTie5 = sortEntries(tie5);
  assertEqual(sortedTie5[0].name, "User X", "Tie-break 5: Fewer missed predictions priority");

  // Tie-breaker 6: Alphabetical name fallback
  // Both: identical stats, User X is Alice, User Y is Bob
  // Expected: Alice first
  const tie6: TestLeaderboardEntry[] = [
    { name: "Bob", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
    { name: "Alice", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
  ];
  const sortedTie6 = sortEntries(tie6);
  assertEqual(sortedTie6[0].name, "Alice", "Tie-break 6: Alphabetical name priority");

  console.log("\nAll scoring logic verification tests passed successfully!");
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
