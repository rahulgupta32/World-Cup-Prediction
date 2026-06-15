import "dotenv/config";
import { prisma } from "../src/lib/db";
import { calculatePoints } from "../src/lib/scoring";
import { PredictionResult } from "@prisma/client";

async function main() {
  console.log("Starting Production Points Recalculation...");

  const confirm = process.env.CONFIRM_RECALCULATE === "true";
  if (!confirm) {
    console.log("=========================================");
    console.log("DRY-RUN MODE ACTIVE. No updates will be written.");
    console.log("Run with CONFIRM_RECALCULATE=true to execute database changes.");
    console.log("=========================================");
  } else {
    console.log("=========================================");
    console.log("LIVE RUN: database updates enabled.");
    console.log("=========================================");
  }

  // 1. Fetch all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  // 2. Fetch completed or cancelled matches
  const matches = await prisma.match.findMany({
    where: {
      status: {
        in: ["COMPLETED", "CANCELLED"],
      },
    },
  });

  const completedMatchesCount = matches.filter(m => m.status === "COMPLETED").length;

  console.log(`Fetched ${users.length} users and ${matches.length} completed/cancelled matches (completed: ${completedMatchesCount}).`);

  // Report statistics tracker
  const report = [];

  let totalPredictionsUpdated = 0;

  for (const user of users) {
    // Fetch all predictions submitted by this user
    const predictions = await prisma.prediction.findMany({
      where: {
        userId: user.id,
      },
      include: {
        match: true,
      },
    });

    let beforeTotalPoints = 0;
    let afterTotalPoints = 0;

    let exactCount = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let voidCount = 0;
    let submittedCompletedCount = 0;

    const updatesToExecute: Array<{
      predictionId: string;
      points: number;
      result: PredictionResult;
    }> = [];

    for (const pred of predictions) {
      // We only recalculate completed or cancelled matches
      if (pred.match.status !== "COMPLETED" && pred.match.status !== "CANCELLED") {
        continue;
      }

      beforeTotalPoints += pred.pointsAwarded;

      const isCancelled = pred.match.status === "CANCELLED";
      let newPoints = 0;
      let newResult: PredictionResult = PredictionResult.VOID;

      if (isCancelled) {
        newPoints = 0;
        newResult = PredictionResult.VOID;
        voidCount++;
      } else {
        submittedCompletedCount++;
        // Apply logic
        const calc = calculatePoints(
          pred.predictedResult,
          pred.predictedTeamAScore,
          pred.predictedTeamBScore,
          pred.match.result!,
          pred.match.teamAScore!,
          pred.match.teamBScore!,
          false
        );
        newPoints = calc.points;
        newResult = calc.predictionResult;

        if (newResult === PredictionResult.EXACT_SCORE) {
          exactCount++;
        } else if (newResult === PredictionResult.CORRECT_OUTCOME) {
          correctCount++;
        } else if (newResult === PredictionResult.WRONG) {
          wrongCount++;
        }
      }

      afterTotalPoints += newPoints;

      if (pred.pointsAwarded !== newPoints || pred.predictionResult !== newResult || !pred.isCalculated) {
        updatesToExecute.push({
          predictionId: pred.id,
          points: newPoints,
          result: newResult,
        });
      }
    }

    // Missed completed matches
    const missedCount = completedMatchesCount - submittedCompletedCount;
    
    // Total adjusted points deducts 1 point per missed completed match
    const beforeAdjustedTotal = beforeTotalPoints; // Before, missed did not deduct anything
    const afterAdjustedTotal = afterTotalPoints - missedCount;

    report.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      exact: exactCount,
      correct: correctCount,
      wrong: wrongCount,
      void: voidCount,
      missed: missedCount,
      beforePoints: beforeAdjustedTotal,
      afterPoints: afterAdjustedTotal,
      needsUpdate: updatesToExecute.length,
    });

    if (confirm && updatesToExecute.length > 0) {
      // Update in transaction block
      await prisma.$transaction(
        updatesToExecute.map((upd) =>
          prisma.prediction.update({
            where: { id: upd.predictionId },
            data: {
              pointsAwarded: upd.points,
              predictionResult: upd.result,
              isCalculated: true,
            },
          })
        )
      );
      totalPredictionsUpdated += updatesToExecute.length;
    }
  }

  // 3. Print Report
  console.log("\n===============================================================================================");
  console.log("RECALCULATION REPORT SUMMARY:");
  console.log("===============================================================================================");
  console.log(
    String("User Name").padEnd(25) +
    String("Exact").padStart(8) +
    String("Correct").padStart(10) +
    String("Wrong").padStart(8) +
    String("Missed").padStart(8) +
    String("Void").padStart(8) +
    String("Before").padStart(10) +
    String("After").padStart(10) +
    String("Updates").padStart(10)
  );
  console.log("-".repeat(95));
  
  for (const rep of report) {
    console.log(
      rep.name.substring(0, 24).padEnd(25) +
      String(rep.exact).padStart(8) +
      String(rep.correct).padStart(10) +
      String(rep.wrong).padStart(8) +
      String(rep.missed).padStart(8) +
      String(rep.void).padStart(8) +
      String(rep.beforePoints).padStart(10) +
      String(rep.afterPoints).padStart(10) +
      String(rep.needsUpdate).padStart(10)
    );
  }
  console.log("===============================================================================================");
  console.log(`Total Predictions Updated In DB: ${totalPredictionsUpdated}`);
  console.log("===============================================================================================\n");
}

main()
  .catch((e) => {
    console.error("Recalculate script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
