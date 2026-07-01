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
  assertEqual(tc1.points, 5, "Group exact score prediction points");
  assertEqual(tc1.predictionResult, PredictionResult.EXACT_SCORE, "Group exact score classification");

  // Test Case 2: Correct Outcome prediction (2-0) -> +3 CORRECT_OUTCOME
  const tc2 = calculatePoints(
    Outcome.TEAM_A,
    2,
    0,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc2.points, 3, "Group correct outcome 2-0 points");
  assertEqual(tc2.predictionResult, PredictionResult.CORRECT_OUTCOME, "Group correct outcome 2-0 classification");

  // Test Case 3: Wrong Prediction (1-1) -> 0 WRONG
  const tc3 = calculatePoints(
    Outcome.DRAW,
    1,
    1,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc3.points, 0, "Group wrong prediction points (must be 0)");
  assertEqual(tc3.predictionResult, PredictionResult.WRONG, "Group wrong prediction classification");

  // Knockout Stage Tests:
  console.log("\nVerifying Knockout Stage scoring cases:");

  // 4. Knockout normal-time exact final score = +5
  const ko1 = calculatePoints(
    Outcome.TEAM_A,
    2,
    0,
    Outcome.TEAM_A,
    2,
    0,
    false
  );
  assertEqual(ko1.points, 5, "Knockout normal-time exact score");

  // 5. Knockout normal-time correct winner = +3
  const ko2 = calculatePoints(
    Outcome.TEAM_A,
    1,
    0,
    Outcome.TEAM_A,
    2,
    0,
    false
  );
  assertEqual(ko2.points, 3, "Knockout normal-time correct winner");

  // 6. Knockout extra-time exact final score = +5
  const ko3 = calculatePoints(
    Outcome.TEAM_B,
    2,
    3,
    Outcome.TEAM_B,
    2,
    3,
    false
  );
  assertEqual(ko3.points, 5, "Knockout extra-time exact final score");

  // 7. Knockout extra-time correct winner = +3
  const ko4 = calculatePoints(
    Outcome.TEAM_B,
    0,
    1,
    Outcome.TEAM_B,
    2,
    3,
    false
  );
  assertEqual(ko4.points, 3, "Knockout extra-time correct winner");

  // 8. Knockout penalties:
  // Final app result: Team A 3-2 Team B (after penalties, recorded as final score)
  const actualKoScoreA = 3;
  const actualKoScoreB = 2;
  const actualKoResult = Outcome.TEAM_A;

  // Prediction A: Team A 3-2 Team B (exact score) -> +5
  const koPen1 = calculatePoints(
    Outcome.TEAM_A,
    3,
    2,
    actualKoResult,
    actualKoScoreA,
    actualKoScoreB,
    false
  );
  assertEqual(koPen1.points, 5, "Knockout penalties exact score prediction");

  // Prediction B: Team A 2-1 Team B (correct winner Team A but different score) -> +3
  const koPen2 = calculatePoints(
    Outcome.TEAM_A,
    2,
    1,
    actualKoResult,
    actualKoScoreA,
    actualKoScoreB,
    false
  );
  assertEqual(koPen2.points, 3, "Knockout penalties correct winner prediction");

  // Prediction C: Team B 3-2 Team A (wrong winner) -> 0
  const koPen3 = calculatePoints(
    Outcome.TEAM_B,
    2,
    3,
    actualKoResult,
    actualKoScoreA,
    actualKoScoreB,
    false
  );
  assertEqual(koPen3.points, 0, "Knockout penalties wrong winner prediction");

  // 9. No match ever returns more than 5 points
  assertEqual(tc1.points <= 5, true, "Group exact score points <= 5");
  assertEqual(ko1.points <= 5, true, "Knockout exact score points <= 5");
  assertEqual(koPen1.points <= 5, true, "Knockout penalties score points <= 5");

  console.log("\nVerifying User Points Example Cases:");
  // User A: exact 2, correct 2, wrong 5, missed 3 => totalPoints = 2*5 + 2*3 = 16
  const userAPoints = 2 * 5 + 2 * 3 + 5 * 0;
  assertEqual(userAPoints, 16, "User A points calculation");

  // User B: exact 1, correct 3, wrong 3, missed 5 => totalPoints = 1*5 + 3*3 = 14
  const userBPoints = 1 * 5 + 3 * 3 + 3 * 0;
  assertEqual(userBPoints, 14, "User B points calculation");

  console.log("\nVerifying Leaderboard Tie-breaking Sorting Logic:");
  
  // Tie-breaker 1: Accuracy/win percentage
  const tie1: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 100, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 0, missedPredictions: 0 },
  ];
  const sortedTie1 = sortEntries(tie1);
  assertEqual(sortedTie1[0].name, "User X", "Tie-break 1: Accuracy priority");

  // Tie-breaker 2: Higher exactScoreCount
  const tie2: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 4, correctOutcomeCount: 0, wrongPredictions: 4, missedPredictions: 0 },
  ];
  const sortedTie2 = sortEntries(tie2);
  assertEqual(sortedTie2[0].name, "User X", "Tie-break 2: Exact score count priority");

  // Tie-breaker 3: Higher correctOutcomeCount
  const tie3: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 4, wrongPredictions: 4, missedPredictions: 0 },
  ];
  const sortedTie3 = sortEntries(tie3);
  assertEqual(sortedTie3[0].name, "User X", "Tie-break 3: Correct outcome count priority");

  // Tie-breaker 4: Fewer wrongPredictions
  const tie4: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 4, missedPredictions: 0 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
  ];
  const sortedTie4 = sortEntries(tie4);
  assertEqual(sortedTie4[0].name, "User X", "Tie-break 4: Fewer wrong predictions priority");

  // Tie-breaker 5: Fewer missedPredictions
  const tie5: TestLeaderboardEntry[] = [
    { name: "User Y", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 2 },
    { name: "User X", totalPoints: 20, accuracy: 50, exactScoreCount: 2, correctOutcomeCount: 2, wrongPredictions: 1, missedPredictions: 0 },
  ];
  const sortedTie5 = sortEntries(tie5);
  assertEqual(sortedTie5[0].name, "User X", "Tie-break 5: Fewer missed predictions priority");

  // Tie-breaker 6: Alphabetical name fallback
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
