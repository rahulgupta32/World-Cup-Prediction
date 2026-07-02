import "dotenv/config";
import { prisma } from "../src/lib/db";
import { isPlaceholderTeam } from "../src/lib/match-reconcile";
import { normalizeTeamName } from "../src/lib/match-sync";
import { fetchFixtures, NormalizedFixture } from "../src/lib/providers";
import * as fs from "fs";
import * as path from "path";

// Parse parameters
function parseArgs() {
  const args = process.argv.slice(2);
  let provider = "worldcup";
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

async function runDiagnostic() {
  console.log("=================================================");
  console.log("   WORLD CUP FIXTURE AUDIT & COMPILATION STATE   ");
  console.log("=================================================");

  const { provider, jsonPath } = parseArgs();
  let accessMode = "HTTP";
  const fixtures: NormalizedFixture[] = [];

  // 1. Fetch/Import provider data
  if (jsonPath) {
    accessMode = "MANUAL_JSON";
    try {
      const resolved = path.resolve(jsonPath);
      if (fs.existsSync(resolved)) {
        const fileContent = fs.readFileSync(resolved, "utf-8");
        const parsed = JSON.parse(fileContent);
        const { findMatchesArray, normalizeFotMobMatch } = require("../src/lib/providers/fotmob");
        const rawMatches = findMatchesArray(parsed);
        if (!rawMatches || !Array.isArray(rawMatches)) {
          console.error("Error: No matches found in the specified JSON file structure.");
          process.exit(1);
        }
        for (const item of rawMatches) {
          const normalized = normalizeFotMobMatch(item);
          if (normalized) fixtures.push(normalized);
        }
        console.log(`Successfully loaded ${fixtures.length} fixtures from JSON file: ${resolved}`);
      } else {
        console.error(`Error: JSON file path not found: ${jsonPath}`);
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`Error parsing JSON file: ${e.message || e}`);
      process.exit(1);
    }
  } else {
    // HTTP/Proxy mode config check
    let isConfigured = true;
    if (provider === "fotmob") {
      isConfigured = 
        process.env.FOOTBALL_PROVIDER === "fotmob" || 
        process.env.FOTMOB_ENABLED === "true" ||
        !!process.env.FOTMOB_BASE_URL;
    } else if (provider !== "worldcup") {
      const key = 
        provider === "apifootball" ? (process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY) :
        provider === "thestatsapi" ? process.env.THE_STATS_API_KEY :
        provider === "kickoffapi" ? process.env.KICKOFF_API_KEY : null;
      isConfigured = !!key;
    }

    if (!isConfigured) {
      console.error("FotMob provider is not configured.");
      console.error(`Missing settings:`);
      console.error(`  - FOTMOB_BASE_URL: ${process.env.FOTMOB_BASE_URL ? "configured" : "missing"}`);
      console.error(`  - FOTMOB_API_KEY: ${process.env.FOTMOB_API_KEY ? "configured" : "missing"}`);
      console.error(`  - FOTMOB_LEAGUE_ID: ${process.env.FOTMOB_LEAGUE_ID || process.env.FOTMOB_TOURNAMENT_ID ? "configured" : "missing"}`);
      console.error("  - Manual JSON mode available: yes");
      process.exit(1);
    }

    accessMode = process.env.FOTMOB_BASE_URL ? "PROXY" : "HTTP";
    console.log(`Fetching fixtures from API provider: "${provider}" via ${accessMode}...`);
    const res = await fetchFixtures(provider);
    if (!res.success) {
      console.error(`Error fetching fixtures: ${res.error}`);
      process.exit(1);
    }
    fixtures.push(...res.fixtures);
    console.log(`Success! Fetched ${res.fixtures.length} fixtures.`);
  }

  const report: any = {
    timestamp: new Date().toISOString(),
    providerUsed: provider,
    accessMode,
    fixturesFetched: fixtures.length,
    upcomingFixtures: fixtures.filter(f => f.status === "UPCOMING" || f.status === "SCHEDULED").length,
    completedFixtures: fixtures.filter(f => f.status === "COMPLETED").length,
    providerTbdCount: fixtures.filter(f => isPlaceholderTeam(f.teamA) || isPlaceholderTeam(f.teamB)).length,
    localTbdCount: 0,
    providerHasRealTeamsButLocalIsTbd: 0,
    missingLocalFixtures: [],
    possibleDuplicateLocalFixtures: [],
    ambiguousMatches: [],
    stageMismatches: [],
    kickoffMismatches: [],
    safeUpdatesAvailable: [],
    manualReviewRequired: [],
  };

  try {
    // 2. Scan local database
    const localMatches = await prisma.match.findMany({
      include: { predictions: true }
    });
    report.localTbdCount = localMatches.filter(m => isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB)).length;

    console.log(`\nLocal matches in DB: ${localMatches.length}`);
    console.log(`Local placeholders (TBD) in DB: ${report.localTbdCount}`);

    // Map provider matches to local candidates
    const matchedLocalIds = new Set<string>();

    for (const f of fixtures) {
      if (!f.providerMatchId) continue;

      // Duplicate DB match checks
      const localMatchesWithSameApiId = localMatches.filter(m => m.apiMatchId === f.providerMatchId);
      if (localMatchesWithSameApiId.length > 1) {
        localMatchesWithSameApiId.forEach(m => {
          report.possibleDuplicateLocalFixtures.push({
            localMatchId: m.id,
            reason: `Multiple local matches share apiMatchId: "${f.providerMatchId}"`
          });
        });
      }

      // Candidate matching
      let dbMatch = localMatches.find(m => m.apiProvider === provider && m.apiMatchId === f.providerMatchId);
      if (!dbMatch) {
        dbMatch = localMatches.find(m => m.apiMatchId === f.providerMatchId);
      }
      if (!dbMatch) {
        // Fallback: stage + time closeness
        dbMatch = localMatches.find(m => {
          const sameStage = m.stage === f.stage;
          const timeDiff = Math.abs(new Date(m.matchTime).getTime() - new Date(f.kickoffTime).getTime());
          return sameStage && timeDiff <= 2 * 60 * 60 * 1000;
        });
      }

      if (dbMatch) {
        matchedLocalIds.add(dbMatch.id);

        const localIsTbd = isPlaceholderTeam(dbMatch.teamA) || isPlaceholderTeam(dbMatch.teamB);
        const provIsTbd = isPlaceholderTeam(f.teamA) || isPlaceholderTeam(f.teamB);

        // Stage audit
        if (dbMatch.stage !== f.stage) {
          report.stageMismatches.push({
            localMatchId: dbMatch.id,
            teams: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
            currentStage: dbMatch.stage,
            proposedStage: f.stage
          });
        }

        // Kickoff audit
        const localTime = new Date(dbMatch.matchTime).getTime();
        const provTime = new Date(f.kickoffTime).getTime();
        if (localTime !== provTime) {
          report.kickoffMismatches.push({
            localMatchId: dbMatch.id,
            teams: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
            currentKickoff: new Date(dbMatch.matchTime).toISOString(),
            proposedKickoff: new Date(f.kickoffTime).toISOString()
          });
        }

        // Classify Action
        if (localIsTbd && !provIsTbd) {
          report.providerHasRealTeamsButLocalIsTbd++;
          report.safeUpdatesAvailable.push({
            localMatchId: dbMatch.id,
            current: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
            proposed: `${f.teamA} vs ${f.teamB}`,
            reason: "Replacing TBD placeholders with qualified team names."
          });
        } else if (!localIsTbd && (normalizeTeamName(dbMatch.teamA) !== normalizeTeamName(f.teamA || "") || normalizeTeamName(dbMatch.teamB) !== normalizeTeamName(f.teamB || ""))) {
          if (dbMatch.predictions.length > 0) {
            report.manualReviewRequired.push({
              localMatchId: dbMatch.id,
              current: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
              proposed: `${f.teamA} vs ${f.teamB}`,
              reason: `Mismatched real team names with ${dbMatch.predictions.length} predictions already submitted.`
            });
          } else {
            report.safeUpdatesAvailable.push({
              localMatchId: dbMatch.id,
              current: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
              proposed: `${f.teamA} vs ${f.teamB}`,
              reason: "Updating mismatched team names (0 predictions submitted)."
            });
          }
        } else if (localTime !== provTime || dbMatch.stage !== f.stage) {
          report.safeUpdatesAvailable.push({
            localMatchId: dbMatch.id,
            current: `${dbMatch.teamA} vs ${dbMatch.teamB}`,
            proposed: `${f.teamA || dbMatch.teamA} vs ${f.teamB || dbMatch.teamB}`,
            reason: "Updating kickoff schedule or stage mappings."
          });
        }
      } else {
        // Missing local match
        report.missingLocalFixtures.push({
          providerMatchId: f.providerMatchId,
          teamA: f.teamA,
          teamB: f.teamB,
          stage: f.stage,
          kickoff: new Date(f.kickoffTime).toISOString()
        });
      }
    }

    // Print summary stats
    console.log(`\nProvider used: ${report.providerUsed}`);
    console.log(`Access mode used: ${report.accessMode}`);
    console.log(`Fixtures fetched/imported: ${report.fixturesFetched}`);
    console.log(`Upcoming fixtures count: ${report.upcomingFixtures}`);
    console.log(`Completed fixtures count: ${report.completedFixtures}`);
    console.log(`Provider TBD count: ${report.providerTbdCount}`);
    console.log(`Local TBD count: ${report.localTbdCount}`);
    console.log(`Provider has real teams but local is TBD: ${report.providerHasRealTeamsButLocalIsTbd}`);
    console.log(`Missing local fixtures count: ${report.missingLocalFixtures.length}`);
    console.log(`Possible duplicate local fixtures count: ${report.possibleDuplicateLocalFixtures.length}`);
    console.log(`Ambiguous matches count: ${report.ambiguousMatches.length}`);
    console.log(`Stage mismatches count: ${report.stageMismatches.length}`);
    console.log(`Kickoff mismatches count: ${report.kickoffMismatches.length}`);
    console.log(`Safe updates available: ${report.safeUpdatesAvailable.length}`);
    console.log(`Manual review required: ${report.manualReviewRequired.length}`);

    // Save JSON Report
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, "provider-fixture-audit.json");
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport successfully saved to: ${outputPath}`);

  } catch (error: any) {
    console.error("Audit encountered an error:", error);
    process.exit(1);
  }
}

runDiagnostic();
