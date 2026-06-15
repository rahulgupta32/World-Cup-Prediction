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

  // Test Case 4: Wrong Prediction (1-1) -> -1 WRONG
  const tc4 = calculatePoints(
    Outcome.DRAW,
    1,
    1,
    actualResult,
    actualScoreA,
    actualScoreB,
    false
  );
  assertEqual(tc4.points, -1, "Wrong Prediction points");
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

  console.log("\nAll scoring logic verification tests passed successfully!");
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
