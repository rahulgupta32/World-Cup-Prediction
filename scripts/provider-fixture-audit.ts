import { prisma } from "../src/lib/db";
import { isPlaceholderTeam } from "../src/lib/match-reconcile";
import { fetchFixtures, NormalizedFixture } from "../src/lib/providers";
import * as fs from "fs";
import * as path from "path";

async function runDiagnostic() {
  console.log("=================================================");
  console.log("   WORLD CUP MULTI-PROVIDER FIXTURE DIAGNOSTIC   ");
  console.log("=================================================");

  const report: any = {
    timestamp: new Date().toISOString(),
    providersScanned: [],
    localPlaceholders: [],
    availableSafeUpdates: [],
    providerConflicts: [],
    rawFeedSizes: {},
  };

  try {
    // 1. Scan local placeholders
    const localMatches = await prisma.match.findMany();
    const localPlaceholders = localMatches.filter(m => isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB));
    console.log(`\nLocal matches in DB: ${localMatches.length}`);
    console.log(`Local placeholders (TBD) in DB: ${localPlaceholders.length}`);
    
    report.localPlaceholders = localPlaceholders.map(m => ({
      id: m.id,
      stage: m.stage,
      teamA: m.teamA,
      teamB: m.teamB,
      kickoff: new Date(m.matchTime).toISOString()
    }));

    // 2. Scan active providers
    const providers = ["worldcup", "apifootball", "thestatsapi", "kickoffapi"];
    const feeds: Record<string, NormalizedFixture[]> = {};

    for (const p of providers) {
      const key = 
        p === "apifootball" ? (process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY) :
        p === "thestatsapi" ? process.env.THE_STATS_API_KEY :
        p === "kickoffapi" ? process.env.KICKOFF_API_KEY : "no_key_required";

      if (key) {
        console.log(`Fetching fixtures from provider: "${p}"...`);
        const res = await fetchFixtures(p);
        if (res.success) {
          feeds[p] = res.fixtures;
          report.rawFeedSizes[p] = res.fixtures.length;
          report.providersScanned.push(p);
          console.log(`- Success! Fetched ${res.fixtures.length} fixtures.`);
        } else {
          console.log(`- Skipped/Failed: ${res.error}`);
        }
      }
    }

    // 3. Print TBD stats per provider
    for (const p of report.providersScanned) {
      const pFixtures = feeds[p];
      const tbdFixtures = pFixtures.filter(f => isPlaceholderTeam(f.teamA) || isPlaceholderTeam(f.teamB));
      console.log(`- Provider "${p}" has ${tbdFixtures.length} TBD fixtures out of ${pFixtures.length}`);
    }

    // 4. Match local placeholders to provider feeds
    console.log("\nAuditing candidate overrides...");
    for (const local of localPlaceholders) {
      const candidates: Record<string, NormalizedFixture> = {};

      for (const p of report.providersScanned) {
        const pFixtures = feeds[p];
        const matchTime = new Date(local.matchTime).getTime();
        
        const equivalent = pFixtures.find(f => {
          const sameStage = f.stage === local.stage;
          const timeDiff = Math.abs(new Date(f.kickoffTime).getTime() - matchTime);
          return sameStage && timeDiff <= 2 * 60 * 60 * 1000;
        });

        if (equivalent) {
          candidates[p] = equivalent;
        }
      }

      // Check if providers have real teams and if they disagree
      const nonTbdFeeds = Object.entries(candidates).filter(([_, f]) => !isPlaceholderTeam(f.teamA) && !isPlaceholderTeam(f.teamB));
      
      if (nonTbdFeeds.length > 0) {
        const firstFeed = nonTbdFeeds[0];
        const conflicts = nonTbdFeeds.filter(([_, f]) => 
          f.teamA?.toLowerCase().trim() !== firstFeed[1].teamA?.toLowerCase().trim() ||
          f.teamB?.toLowerCase().trim() !== firstFeed[1].teamB?.toLowerCase().trim()
        );

        if (conflicts.length > 0) {
          console.warn(`⚠️ PROVIDER CONFLICT for Local Match ID: ${local.id}`);
          const conflictItem = {
            localMatchId: local.id,
            localTeams: `${local.teamA} vs ${local.teamB}`,
            providers: nonTbdFeeds.map(([pName, f]) => ({
              provider: pName,
              teamA: f.teamA,
              teamB: f.teamB
            }))
          };
          report.providerConflicts.push(conflictItem);
          nonTbdFeeds.forEach(([pName, f]) => {
            console.log(`  * ${pName} shows: "${f.teamA} vs ${f.teamB}"`);
          });
        } else {
          console.log(`✅ SAFE UPDATE AVAILABLE for Local Match ID: ${local.id}`);
          console.log(`  * Current: "${local.teamA} vs ${local.teamB}"`);
          console.log(`  * Proposed (from ${firstFeed[0]}): "${firstFeed[1].teamA} vs ${firstFeed[1].teamB}"`);
          
          report.availableSafeUpdates.push({
            localMatchId: local.id,
            current: `${local.teamA} vs ${local.teamB}`,
            proposed: `${firstFeed[1].teamA} vs ${firstFeed[1].teamB}`,
            provider: firstFeed[0]
          });
        }
      }
    }

    // Save JSON Report
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, "provider-fixture-audit.json");
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport successfully saved to: ${outputPath}`);

  } catch (error: any) {
    console.error("Diagnostic encountered an error:", error);
  }
}

runDiagnostic();
