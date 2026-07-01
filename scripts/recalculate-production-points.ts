import "dotenv/config";
import { prisma } from "../src/lib/db";
import { calculatePoints } from "../src/lib/scoring";
import { PredictionResult } from "@prisma/client";

async function main() {
  console.log("=========================================");
  console.log("Starting Production Points Recalculation...");
  console.log("=========================================");

  const confirm = process.env.CONFIRM_RECALCULATE === "true";
  if (!confirm) {
    console.log("DRY-RUN MODE ACTIVE. No updates will be written.");
    console.log("Run with CONFIRM_RECALCULATE=true to execute database changes.");
  } else {
    console.log("LIVE RUN: database updates enabled.");
  }
  console.log("=========================================");

  // 1. Fetch completed or cancelled matches
  const matches = await prisma.match.findMany({
    where: {
      status: {
        in: ["COMPLETED", "CANCELLED"],
      },
    },
  });

  const completedMatchesCount = matches.filter(m => m.status === "COMPLETED").length;
  console.log(`Fetched ${matches.length} completed/cancelled matches (completed: ${completedMatchesCount}).`);

  // 2. Fetch all predictions with match and user details
  const predictions = await prisma.prediction.findMany({
    include: {
      match: true,
      user: true,
    },
  });

  // Recalculation Stats
  let totalPredictionsChecked = 0;
  let predictionsChanging = 0;
  let oldTotalPoints = 0;
  let newTotalPoints = 0;

  const penaltyDecidedMatchesAffected = new Set<string>();
  const usersAffected = new Set<string>();

  let countOf10 = 0;
  let countOf8 = 0;
  let countOf5 = 0;
  let countOf3 = 0;
  let countOf0 = 0;

  const updatesToExecute: Array<{
    predictionId: string;
    points: number;
    result: PredictionResult;
  }> = [];

  for (const pred of predictions) {
    // Only calculate for completed/cancelled matches
    if (pred.match.status !== "COMPLETED" && pred.match.status !== "CANCELLED") {
      continue;
    }

    totalPredictionsChecked++;
    oldTotalPoints += pred.pointsAwarded;

    const isCancelled = pred.match.status === "CANCELLED";
    let newPoints = 0;
    let newResult: PredictionResult = PredictionResult.VOID;

    if (isCancelled) {
      newPoints = 0;
      newResult = PredictionResult.VOID;
      countOf0++;
    } else {
      const calc = calculatePoints(
        pred.predictedResult,
        pred.predictedTeamAScore,
        pred.predictedTeamBScore,
        pred.match.result!,
        pred.match.teamAScore!,
        pred.match.teamBScore!,
        false,
        pred.match.isKnockout,
        pred.match.decidedBy,
        pred.match.winnerTeam,
        pred.match.penaltyTeamAScore,
        pred.match.penaltyTeamBScore,
        pred.predictsPenalties,
        pred.predictedPenaltyTeamAScore,
        pred.predictedPenaltyTeamBScore,
        pred.predictedPenaltyWinner
      );
      newPoints = calc.points;
      newResult = calc.predictionResult;

      if (newPoints === 10) countOf10++;
      else if (newPoints === 8) countOf8++;
      else if (newPoints === 5) countOf5++;
      else if (newPoints === 3) countOf3++;
      else countOf0++;
    }

    newTotalPoints += newPoints;

    const needsUpdate = 
      pred.pointsAwarded !== newPoints || 
      pred.predictionResult !== newResult || 
      !pred.isCalculated;

    if (needsUpdate) {
      predictionsChanging++;
      usersAffected.add(pred.userId);
      if (pred.match.decidedBy === "PENALTIES") {
        penaltyDecidedMatchesAffected.add(pred.matchId);
      }
      updatesToExecute.push({
        predictionId: pred.id,
        points: newPoints,
        result: newResult,
      });
    }
  }

  // 3. Execute updates if CONFIRM_RECALCULATE=true
  let updatesWritten = 0;
  if (confirm && updatesToExecute.length > 0) {
    console.log(`Executing ${updatesToExecute.length} prediction updates in DB...`);
    for (const update of updatesToExecute) {
      await prisma.prediction.update({
        where: { id: update.predictionId },
        data: {
          pointsAwarded: update.points,
          predictionResult: update.result,
          isCalculated: true,
        },
      });
      updatesWritten++;
    }
    console.log("DB update completed successfully.");
  }

  // 4. Print dry-run / write summary
  console.log("\n========================================================");
  console.log("RECALCULATION SUMMARY REPORT");
  console.log("========================================================");
  console.log(`Total Predictions Checked:       ${totalPredictionsChecked}`);
  console.log(`Predictions That Would Change:   ${predictionsChanging}`);
  console.log(`Old Total Points:                ${oldTotalPoints}`);
  console.log(`New Total Points:                ${newTotalPoints}`);
  console.log(`Penalty Matches Affected:        ${penaltyDecidedMatchesAffected.size}`);
  console.log(`Users Affected:                  ${usersAffected.size}`);
  console.log("--------------------------------------------------------");
  console.log("New Points Distribution:");
  console.log(`- Count of +10 points:           ${countOf10}`);
  console.log(`- Count of +8 points:            ${countOf8}`);
  console.log(`- Count of +5 points:            ${countOf5}`);
  console.log(`- Count of +3 points:            ${countOf3}`);
  console.log(`- Count of 0 points:             ${countOf0}`);
  console.log("--------------------------------------------------------");
  if (!confirm) {
    console.log("Actual DB Updates Written:       0 (Dry run)");
  } else {
    console.log(`Actual DB Updates Written:       ${updatesWritten}`);
  }
  console.log("========================================================\n");
}

main()
  .catch((e) => {
    console.error("Recalculate script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
