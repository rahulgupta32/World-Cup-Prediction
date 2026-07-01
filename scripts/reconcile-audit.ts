import { prisma } from "../src/lib/db";
import { isPlaceholderTeam } from "../src/lib/match-reconcile";

async function runAudit() {
  console.log("=========================================");
  console.log("    WORLD CUP PREDICTION FIXTURE AUDIT   ");
  console.log("=========================================");

  try {
    const matches = await prisma.match.findMany({
      include: {
        predictions: true,
      },
    });

    console.log(`Scanned ${matches.length} matches from database.`);

    const placeholders = matches.filter(
      (m) => isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB)
    );
    console.log(`\nFound ${placeholders.length} placeholder (TBD) matches:`);
    placeholders.forEach((m) => {
      console.log(`- [${m.stage}] ID: ${m.id}, Teams: ${m.teamA} vs ${m.teamB}, Time: ${new Date(m.matchTime).toISOString()}`);
    });

    // Check duplicate apiMatchId
    const apiIdsMap = new Map<string, typeof matches>();
    matches.forEach((m) => {
      if (m.apiMatchId) {
        const list = apiIdsMap.get(m.apiMatchId) || [];
        list.push(m);
        apiIdsMap.set(m.apiMatchId, list);
      }
    });

    console.log("\nChecking for Duplicate apiMatchId...");
    let duplicateIdsCount = 0;
    for (const [apiId, list] of apiIdsMap.entries()) {
      if (list.length > 1) {
        duplicateIdsCount++;
        console.log(`- Duplicate API Match ID: "${apiId}" shared by:`);
        list.forEach((m) => {
          console.log(`  * ID: ${m.id}, Teams: ${m.teamA} vs ${m.teamB}, Time: ${new Date(m.matchTime).toISOString()}`);
        });
      }
    }
    if (duplicateIdsCount === 0) {
      console.log("✅ No duplicate apiMatchId records found.");
    }

    // Check duplicate by same teams + same kickoff
    const teamKickoffMap = new Map<string, typeof matches>();
    matches.forEach((m) => {
      const tA = m.teamA.toLowerCase().trim();
      const tB = m.teamB.toLowerCase().trim();
      const sortedTeams = [tA, tB].sort().join(" vs ");
      const key = `${sortedTeams} @ ${new Date(m.matchTime).toISOString()}`;
      const list = teamKickoffMap.get(key) || [];
      list.push(m);
      teamKickoffMap.set(key, list);
    });

    console.log("\nChecking for Overlapping Teams + Kickoff Time Duplicates...");
    let overlapCount = 0;
    for (const [key, list] of teamKickoffMap.entries()) {
      if (list.length > 1) {
        overlapCount++;
        console.log(`- Overlap: "${key}" shared by:`);
        list.forEach((m) => {
          console.log(`  * ID: ${m.id}, Predictions Count: ${m.predictions.length}`);
        });
      }
    }
    if (overlapCount === 0) {
      console.log("✅ No overlapping team + kickoff time duplicates found.");
    }

    // Check matches missing apiMatchId
    const missingApiId = matches.filter((m) => !m.apiMatchId);
    console.log(`\nMatches missing apiMatchId: ${missingApiId.length}`);
    if (missingApiId.length > 0) {
      console.log("Example matches missing API ID:");
      missingApiId.slice(0, 5).forEach((m) => {
        console.log(`- [${m.stage}] ID: ${m.id}, Teams: ${m.teamA} vs ${m.teamB}`);
      });
    }

  } catch (error: any) {
    console.error("Audit encountered an error:", error);
  }
}

runAudit();
