import "dotenv/config";
import { prisma } from "../src/lib/db";
import { isPlaceholderTeam } from "../src/lib/match-reconcile";
import { fetchFixtures, NormalizedFixture } from "../src/lib/providers";
import * as fs from "fs";
import * as path from "path";

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let provider: string | null = null;
  let jsonPath: string | null = null;

  args.forEach(arg => {
    if (arg.startsWith("--provider=")) {
      provider = arg.split("=")[1].trim();
    } else if (arg.startsWith("--json=")) {
      jsonPath = arg.split("=")[1].trim();
    }
  });

  return { provider, jsonPath };
}

async function main() {
  console.log("=========================================");
  console.log("    LOCAL MATCHES DATA QUALITY REPORT    ");
  console.log("=========================================");

  const { provider, jsonPath } = parseArgs();

  // Load local database matches
  const allMatches = await prisma.match.findMany({
    orderBy: { matchTime: "asc" }
  });

  console.log(`Total Local Matches in Database: ${allMatches.length}`);

  // 1. Upcoming matches sorted by matchTime
  const upcomingMatches = allMatches.filter(m => m.status === "UPCOMING" || (m.status as string) === "SCHEDULED" || m.status === "POSTPONED");
  console.log(`\n1. Upcoming Matches (${upcomingMatches.length}):`);
  upcomingMatches.forEach((m, idx) => {
    console.log(`  [${idx + 1}] ID: ${m.id} | Stage: ${m.stage} | ${m.teamA} vs ${m.teamB} | Kickoff: ${m.matchTime ? m.matchTime.toISOString() : "Time TBA"} | Status: ${m.status}`);
  });

  // 2. Matches with missing matchTime
  const missingTimeMatches = allMatches.filter(m => !m.matchTime || isNaN(new Date(m.matchTime).getTime()));
  console.log(`\n2. Matches with Missing Kickoff Time (${missingTimeMatches.length}):`);
  missingTimeMatches.forEach(m => {
    console.log(`  ID: ${m.id} | ${m.teamA} vs ${m.teamB} | Stage: ${m.stage}`);
  });

  // 3. Matches with TBD/TBC teams
  const tbdMatches = allMatches.filter(m => isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB));
  console.log(`\n3. Matches with TBD/TBC Placeholder Teams (${tbdMatches.length}):`);
  tbdMatches.forEach(m => {
    console.log(`  ID: ${m.id} | Stage: ${m.stage} | Current: "${m.teamA} vs ${m.teamB}" | Kickoff: ${m.matchTime?.toISOString()}`);
  });

  // 4. Duplicate matches checks (REAL DUPLICATES ONLY)
  console.log(`\n4. Duplicate Matches Checks:`);
  
  // - Same apiProvider/apiMatchId
  const apiIdMap = new Map<string, string[]>();
  allMatches.forEach(m => {
    if (m.apiProvider && m.apiMatchId) {
      const key = `${m.apiProvider}:${m.apiMatchId}`;
      const list = apiIdMap.get(key) || [];
      list.push(m.id);
      apiIdMap.set(key, list);
    }
  });
  const apiIdDupes = Array.from(apiIdMap.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`  - Duplicates by apiProvider/apiMatchId: ${apiIdDupes.length}`);
  apiIdDupes.forEach(([key, ids]) => {
    console.log(`    * Key "${key}" mapped to IDs: ${ids.join(", ")}`);
  });

  // - Same teams (normal and reversed) + same kickoff
  const teamsKickoffMap = new Map<string, string[]>();
  allMatches.forEach(m => {
    const teams = [m.teamA.toLowerCase().trim(), m.teamB.toLowerCase().trim()].sort().join(" vs ");
    const kickoff = m.matchTime ? m.matchTime.toISOString() : "TBA";
    const key = `${teams} @ ${kickoff}`;
    const list = teamsKickoffMap.get(key) || [];
    list.push(m.id);
    teamsKickoffMap.set(key, list);
  });
  const teamsKickoffDupes = Array.from(teamsKickoffMap.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`  - Duplicates by same teams (normal/reversed) + kickoff: ${teamsKickoffDupes.length}`);
  teamsKickoffDupes.forEach(([key, ids]) => {
    console.log(`    * "${key}" mapped to IDs: ${ids.join(", ")}`);
  });

  // 5. Informational clusters (NOT counted as duplicates)
  console.log(`\n5. Informational Clusters:`);
  
  // - Same kickoff time clusters
  const kickoffMap = new Map<string, string[]>();
  allMatches.forEach(m => {
    const kickoff = m.matchTime ? m.matchTime.toISOString() : "TBA";
    const list = kickoffMap.get(kickoff) || [];
    list.push(m.id);
    kickoffMap.set(kickoff, list);
  });
  const kickoffClusters = Array.from(kickoffMap.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`  - Same kickoff clusters, informational only: ${kickoffClusters.length}`);

  // - Same stage + same kickoff clusters
  const stageKickoffMap = new Map<string, string[]>();
  allMatches.forEach(m => {
    const kickoff = m.matchTime ? m.matchTime.toISOString() : "TBA";
    const key = `${m.stage} @ ${kickoff}`;
    const list = stageKickoffMap.get(key) || [];
    list.push(m.id);
    stageKickoffMap.set(key, list);
  });
  const stageKickoffClusters = Array.from(stageKickoffMap.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`  - Same kickoff/stage clusters, informational only: ${stageKickoffClusters.length}`);
  stageKickoffClusters.forEach(([key, ids]) => {
    console.log(`    * "${key}" matches count: ${ids.length} (IDs: ${ids.join(", ")})`);
  });

  const validStatuses = ["UPCOMING", "SCHEDULED", "LIVE", "IN_PROGRESS", "POSTPONED", "COMPLETED", "CANCELLED", "VOID"];
  const hiddenMatches = allMatches.filter(m => !validStatuses.includes(m.status as string));
  console.log(`\n6. Matches not appearing due to status/filtering (hidden) (${hiddenMatches.length}):`);
  hiddenMatches.forEach(m => {
    console.log(`  ID: ${m.id} | Status: ${m.status} | ${m.teamA} vs ${m.teamB}`);
  });

  // Counts by status & stage
  const statusCounts: Record<string, number> = {};
  allMatches.forEach(m => {
    statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
  });
  const stageCounts: Record<string, number> = {};
  allMatches.forEach(m => {
    stageCounts[m.stage] = (stageCounts[m.stage] || 0) + 1;
  });

  // 7. Provider Completeness Report
  let providerFixtures: NormalizedFixture[] | null = null;
  let providerMode = "NONE";

  if (jsonPath) {
    providerMode = "JSON_FILE";
    try {
      const resolved = path.resolve(jsonPath);
      if (fs.existsSync(resolved)) {
        const fileContent = fs.readFileSync(resolved, "utf-8");
        const parsed = JSON.parse(fileContent);
        const { findMatchesArray, normalizeFotMobMatch } = require("../src/lib/providers/fotmob");
        const rawMatches = findMatchesArray(parsed);
        if (rawMatches && Array.isArray(rawMatches)) {
          providerFixtures = [];
          for (const raw of rawMatches) {
            const normalized = normalizeFotMobMatch(raw);
            if (normalized) providerFixtures.push(normalized);
          }
        }
      } else {
        console.warn(`\n[WARNING] Specified JSON file path not found: ${jsonPath}`);
      }
    } catch (e: any) {
      console.warn(`\n[WARNING] Failed to parse provider JSON file: ${e.message || e}`);
    }
  } else if (provider) {
    providerMode = "HTTP_API";
    // Check fotmob configuration
    let isConfigured = true;
    if (provider === "fotmob") {
      isConfigured = 
        process.env.FOOTBALL_PROVIDER === "fotmob" || 
        process.env.FOTMOB_ENABLED === "true" ||
        !!process.env.FOTMOB_BASE_URL;
    }

    if (isConfigured) {
      try {
        const res = await fetchFixtures(provider);
        if (res.success) {
          providerFixtures = res.fixtures;
        }
      } catch (e) {
        // Silent catch
      }
    } else {
      console.log("\nFotMob provider is not configured.");
      console.log(`  - FOTMOB_BASE_URL: ${process.env.FOTMOB_BASE_URL ? "configured" : "missing"}`);
      console.log(`  - FOTMOB_API_KEY: ${process.env.FOTMOB_API_KEY ? "configured" : "missing"}`);
      console.log(`  - FOTMOB_LEAGUE_ID: ${process.env.FOTMOB_LEAGUE_ID || process.env.FOTMOB_TOURNAMENT_ID ? "configured" : "missing"}`);
      console.log("  - Manual JSON mode available: yes");
    }
  }

  console.log(`\n7. Completeness & Comparison Report:`);
  if (providerFixtures) {
    const provFixtures = providerFixtures;
    const providerUpcoming = provFixtures.filter(f => f.status === "UPCOMING" || f.status === "SCHEDULED").length;
    const providerPlaceholders = provFixtures.filter(f => isPlaceholderTeam(f.teamA) || isPlaceholderTeam(f.teamB)).length;

    let missingLocallyCount = 0;
    let localMatchesNotFoundCount = 0;
    let stageMismatches = 0;
    let kickoffMismatches = 0;

    const matchedLocalIds = new Set<string>();

    for (const f of provFixtures) {
      let dbMatch = allMatches.find(m => m.apiProvider === (provider || "fotmob") && m.apiMatchId === f.providerMatchId);
      if (!dbMatch && f.providerMatchId) {
        dbMatch = allMatches.find(m => m.apiMatchId === f.providerMatchId);
      }
      if (!dbMatch) {
        // Fallback: stage + kickoff closeness
        dbMatch = allMatches.find(m => {
          const sameStage = m.stage === f.stage;
          const timeDiff = Math.abs(new Date(m.matchTime).getTime() - new Date(f.kickoffTime).getTime());
          return sameStage && timeDiff <= 2 * 60 * 60 * 1000;
        });
      }

      if (dbMatch) {
        matchedLocalIds.add(dbMatch.id);
        if (dbMatch.stage !== f.stage) stageMismatches++;
        if (new Date(dbMatch.matchTime).getTime() !== new Date(f.kickoffTime).getTime()) kickoffMismatches++;
      } else {
        missingLocallyCount++;
      }
    }

    localMatchesNotFoundCount = allMatches.length - matchedLocalIds.size;

    console.log(`  - Provider Feed Mode: ${providerMode}`);
    console.log(`  - Provider total fixtures: ${provFixtures.length}`);
    console.log(`  - Local total matches: ${allMatches.length}`);
    console.log(`  - Provider upcoming count: ${providerUpcoming}`);
    console.log(`  - Local upcoming count: ${upcomingMatches.length}`);
    console.log(`  - Provider placeholders count: ${providerPlaceholders}`);
    console.log(`  - Local placeholders count: ${tbdMatches.length}`);
    console.log(`  - Provider fixtures missing locally: ${missingLocallyCount}`);
    console.log(`  - Local matches not found in provider: ${localMatchesNotFoundCount}`);
    console.log(`  - Stage mismatches: ${stageMismatches}`);
    console.log(`  - Kickoff date mismatches: ${kickoffMismatches}`);
  } else {
    console.log("  Provider completeness check skipped because provider is not configured or no JSON was provided.");
  }

  // Count by status
  console.log(`\n8. Status Counts:`);
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  - ${status.toLowerCase()}: ${count}`);
  });

  // Count by stage
  console.log(`\n9. Stage Counts:`);
  Object.entries(stageCounts).forEach(([stage, count]) => {
    console.log(`  - ${stage.toLowerCase()}: ${count}`);
  });

  console.log("\n=========================================");
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
