import "dotenv/config";
import { prisma } from "../src/lib/db";

function normalizeTeamName(name: string): string {
  if (!name) return "";
  let clean = name.trim().toLowerCase();
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/\s+/g, " ");

  const mapping: Record<string, string> = {
    "south korea": "korea republic",
    "republic of korea": "korea republic",
    "czech republic": "czechia",
    "united states": "usa",
    "united states of america": "usa",
    "turkey": "türkiye",
    "turkiye": "türkiye",
    "türkiye": "türkiye",
    "democratic republic of the congo": "dr congo",
    "congo dr": "dr congo",
  };

  if (mapping[clean]) {
    return mapping[clean];
  }
  return clean;
}

async function main() {
  console.log("Starting Match Cleanup Script...");

  const confirmCleanup = process.env.CONFIRM_CLEANUP === "true";
  if (!confirmCleanup) {
    console.log("=========================================");
    console.log("DRY-RUN MODE ACTIVE. No data will be deleted.");
    console.log("Run with CONFIRM_CLEANUP=true to execute deletions.");
    console.log("=========================================");
  } else {
    console.log("=========================================");
    console.log("LIVE RUN: MODIFICATIONS AND DELETIONS ENABLED.");
    console.log("=========================================");
  }

  // 1. Fetch all matches and their predictions
  const allMatches = await prisma.match.findMany({
    include: {
      predictions: true,
    },
  });

  console.log(`Fetched ${allMatches.length} total matches from DB.`);

  // 2. Identify duplicate groups
  // We will group matches by normalized team names (sorted alphabetically) and match date (YYYY-MM-DD)
  const groups: Record<string, typeof allMatches> = {};

  for (const match of allMatches) {
    const normA = normalizeTeamName(match.teamA);
    const normB = normalizeTeamName(match.teamB);
    const sortedTeams = [normA, normB].sort().join(" vs ");
    
    // Group by team pair and kickoff date proximity (within same day)
    const dateKey = new Date(match.matchTime).toISOString().split("T")[0];
    const groupKey = `${sortedTeams} @ ${dateKey}`;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(match);
  }

  let totalDuplicateGroups = 0;
  let totalMatchesDeleted = 0;
  let totalPredictionsMoved = 0;
  let totalPredictionsDeleted = 0;

  for (const [groupKey, matches] of Object.entries(groups)) {
    if (matches.length <= 1) continue;

    totalDuplicateGroups++;
    console.log(`\nDuplicate Group: "${groupKey}" containing ${matches.length} fixtures`);

    // Determine the canonical match to keep
    // Preference order:
    // 1. Has apiProvider: "worldcup26.ir"
    // 2. Has apiMatchId !== null
    // 3. Match with the highest number of predictions
    // 4. Default: first match by ID
    const sorted = [...matches].sort((a, b) => {
      const aIsApi = a.apiProvider === "worldcup26.ir" ? 1 : 0;
      const bIsApi = b.apiProvider === "worldcup26.ir" ? 1 : 0;
      if (aIsApi !== bIsApi) return bIsApi - aIsApi;

      const aHasId = a.apiMatchId ? 1 : 0;
      const bHasId = b.apiMatchId ? 1 : 0;
      if (aHasId !== bHasId) return bHasId - aHasId;

      return b.predictions.length - a.predictions.length;
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    console.log(`  [KEEP CANONICAL]: ID: ${canonical.id} | ${canonical.teamA} vs ${canonical.teamB} (${canonical.status}) | API ID: ${canonical.apiMatchId} | Predictions: ${canonical.predictions.length}`);

    // Update canonical match with team normalization fields if they are null
    const normA = normalizeTeamName(canonical.teamA);
    const normB = normalizeTeamName(canonical.teamB);
    const teams = [normA, normB].sort();
    const dateKey = new Date(canonical.matchTime).toISOString().split("T")[0];

    if (confirmCleanup) {
      await prisma.match.update({
        where: { id: canonical.id },
        data: {
          normalizedTeamA: teams[0],
          normalizedTeamB: teams[1],
          matchDateKey: dateKey,
        },
      });
    }

    for (const dup of duplicates) {
      console.log(`  [REMOVE DUPLICATE]: ID: ${dup.id} | ${dup.teamA} vs ${dup.teamB} (${dup.status}) | API ID: ${dup.apiMatchId} | Predictions: ${dup.predictions.length}`);

      // Safe predictions merging
      for (const pred of dup.predictions) {
        // Check if user already predicted the canonical match
        const hasPredOnCanonical = canonical.predictions.some(p => p.userId === pred.userId);
        
        if (hasPredOnCanonical) {
          // Conflict: user predicted both!
          console.log(`    - Prediction conflict for user ${pred.userId}. Duplicate prediction will be DELETED.`);
          totalPredictionsDeleted++;
          if (confirmCleanup) {
            await prisma.prediction.delete({
              where: { id: pred.id },
            });
          }
        } else {
          // No conflict: safe to move prediction to canonical
          console.log(`    - Moving prediction for user ${pred.userId} to canonical match.`);
          totalPredictionsMoved++;
          if (confirmCleanup) {
            await prisma.prediction.update({
              where: { id: pred.id },
              data: {
                matchId: canonical.id,
              },
            });
          }
        }
      }

      // Safe deletion of duplicate match
      totalMatchesDeleted++;
      if (confirmCleanup) {
        await prisma.match.delete({
          where: { id: dup.id },
        });
      }
    }
  }

  console.log("\n=========================================");
  console.log("CLEANUP REPORT SUMMARY:");
  console.log(`- Total Duplicate Groups Processed: ${totalDuplicateGroups}`);
  console.log(`- Duplicate Matches Removed: ${totalMatchesDeleted}`);
  console.log(`- Predictions Safely Moved: ${totalPredictionsMoved}`);
  console.log(`- Conflicting Predictions Deleted: ${totalPredictionsDeleted}`);
  console.log(`- Total Affected Rows: ${totalMatchesDeleted + totalPredictionsMoved + totalPredictionsDeleted}`);
  console.log("=========================================");
}

main()
  .catch((e) => {
    console.error("Cleanup script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
