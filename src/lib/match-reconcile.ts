import { prisma } from "./db";
import { Outcome, MatchStatus, MatchStage } from "@prisma/client";
import { 
  normalizeTeamName, 
  getCanonicalTeamName, 
} from "./match-sync";
import { fetchFixtures, NormalizedFixture } from "./providers";

export type ReconcileItem = {
  localId: string | null;
  apiId: string | null;
  currentTeamA: string | null;
  currentTeamB: string | null;
  proposedTeamA: string | null;
  proposedTeamB: string | null;
  currentKickoff: string | null; // ISO
  proposedKickoff: string | null; // ISO
  provider: string;
  confidence: string; // "Priority 1" | "Priority 3" | ...
  action: "UPDATE" | "SKIP" | "AMBIGUOUS" | "RISKY" | "CREATE" | "PROVIDER_CONFLICT";
  reason: string;
};

export function isPlaceholderTeam(name: string | null | undefined): boolean {
  if (!name) return true;
  const clean = name.toLowerCase().trim();
  return (
    clean === "" ||
    clean === "tbd" ||
    clean === "tbc" ||
    clean === "to be determined" ||
    clean === "null" ||
    clean.includes("winner match") ||
    clean.includes("winner of match") ||
    clean.includes("runner-up group") ||
    clean.includes("winner group") ||
    clean.includes("2nd group") ||
    clean.includes("group winner")
  );
}

function findEquivalentFixture(primary: NormalizedFixture, fallbackList: NormalizedFixture[]): NormalizedFixture | null {
  const primaryTime = new Date(primary.kickoffTime).getTime();
  const candidates = fallbackList.filter(f => {
    const sameStage = f.stage === primary.stage;
    const timeDiff = Math.abs(new Date(f.kickoffTime).getTime() - primaryTime);
    return sameStage && timeDiff <= 2 * 60 * 60 * 1000; // within 2 hours
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export async function auditAndReconcileFixtures(
  providerSelection: string = "worldcup", 
  applyUpdate: boolean = false
) {
  const summary = {
    providerUsed: providerSelection,
    totalApiFixtures: 0,
    totalLocalScanned: 0,
    placeholdersFound: 0,
    safeUpdatesIdentified: 0,
    updatesApplied: 0,
    ambiguousSkipped: 0,
    riskySkipped: 0,
    providerConflicts: 0,
    missingLocal: 0,
    errors: [] as string[],
  };

  const items: ReconcileItem[] = [];

  try {
    // 1. Determine active providers and fetch their data
    const activeProviders = ["worldcup", "apifootball", "thestatsapi", "kickoffapi"];
    const fetchedDataMap = new Map<string, NormalizedFixture[]>();

    // If selected provider is not "all", verify key is configured (unless it's worldcup)
    if (providerSelection !== "all" && providerSelection !== "worldcup") {
      const key = 
        providerSelection === "apifootball" ? (process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY) :
        providerSelection === "thestatsapi" ? process.env.THE_STATS_API_KEY :
        providerSelection === "kickoffapi" ? process.env.KICKOFF_API_KEY : null;

      if (!key) {
        return { success: false, error: "API key is not configured.", summary, items };
      }
    }

    // Fetch primary / selected provider
    if (providerSelection !== "all") {
      console.log(`[RECONCILE] Fetching fixtures from primary provider: ${providerSelection}`);
      const res = await fetchFixtures(providerSelection);
      if (!res.success) {
        return { success: false, error: res.error || `Failed to fetch from ${providerSelection}`, summary, items };
      }
      fetchedDataMap.set(providerSelection, res.fixtures);
    } else {
      // Fetch all configured providers
      console.log("[RECONCILE] Fetching from all configured providers...");
      for (const p of activeProviders) {
        const key = 
          p === "apifootball" ? (process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY) :
          p === "thestatsapi" ? process.env.THE_STATS_API_KEY :
          p === "kickoffapi" ? process.env.KICKOFF_API_KEY : "has_no_key_required";

        if (key) {
          const res = await fetchFixtures(p);
          if (res.success) {
            fetchedDataMap.set(p, res.fixtures);
          } else {
            console.warn(`[RECONCILE] Fallback provider ${p} failed: ${res.error}`);
          }
        }
      }
    }

    // Identify primary list of API fixtures
    let primaryProvider = providerSelection === "all" ? "worldcup" : providerSelection;
    if (providerSelection === "all" && !fetchedDataMap.has(primaryProvider)) {
      // Pick first successfully fetched provider as primary
      primaryProvider = Array.from(fetchedDataMap.keys())[0] || "worldcup";
    }

    const primaryFixtures = fetchedDataMap.get(primaryProvider) || [];
    summary.totalApiFixtures = primaryFixtures.length;

    // Collect fallback fixtures from other active providers
    const fallbackProvidersList: { name: string; fixtures: NormalizedFixture[] }[] = [];
    for (const [pName, pFixtures] of fetchedDataMap.entries()) {
      if (pName !== primaryProvider) {
        fallbackProvidersList.push({ name: pName, fixtures: pFixtures });
      }
    }

    // 2. Fetch all local matches and predictions
    const dbMatches = await prisma.match.findMany({
      include: {
        predictions: true,
      },
    });

    summary.totalLocalScanned = dbMatches.length;

    // Count placeholders
    dbMatches.forEach(m => {
      if (isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB)) {
        summary.placeholdersFound++;
      }
    });

    // 3. Map API matches to DB placeholders
    const apiCandidatesMap = new Map<string, { m: any; priority: number }[]>();
    const localMatchClaims = new Map<string, string[]>(); // dbMatchId -> list of apiMatchIds claiming it

    for (const apiMatch of primaryFixtures) {
      if (!apiMatch.providerMatchId) continue;
      const cands: { m: any; priority: number }[] = [];

      // Priority 1: Same apiProvider + apiMatchId
      const p1 = dbMatches.filter(m => m.apiProvider === primaryProvider && m.apiMatchId === apiMatch.providerMatchId);
      if (p1.length > 0) {
        p1.forEach(m => cands.push({ m, priority: 1 }));
      } else {
        // Priority 2: Same FIFA / match number
        const p2 = dbMatches.filter(m => m.apiMatchId === apiMatch.providerMatchId);
        if (p2.length > 0) {
          p2.forEach(m => cands.push({ m, priority: 2 }));
        } else {
          // Priority 3: Same stage/round + same kickoff time + same venue
          const p3 = dbMatches.filter(m => {
            const sameStage = m.stage === apiMatch.stage;
            const sameTime = apiMatch.kickoffTime && Math.abs(new Date(m.matchTime).getTime() - new Date(apiMatch.kickoffTime).getTime()) < 1000;
            const sameVenue = (m.venue || "").trim().toLowerCase() === (apiMatch.venue || "").trim().toLowerCase();
            return sameStage && sameTime && (m.venue ? sameVenue : true);
          });

          if (p3.length > 0) {
            p3.forEach(m => cands.push({ m, priority: 3 }));
          } else {
            // Priority 4: Same stage/round + placeholder names
            const p4 = dbMatches.filter(m => {
              const sameStage = m.stage === apiMatch.stage;
              const localHasPlaceholder = isPlaceholderTeam(m.teamA) || isPlaceholderTeam(m.teamB);
              return sameStage && localHasPlaceholder;
            });

            if (p4.length > 0) {
              p4.forEach(m => cands.push({ m, priority: 4 }));
            } else {
              // Priority 5: Same teams + close kickoff time (within 24 hours)
              const p5 = dbMatches.filter(m => {
                const apiA = normalizeTeamName(apiMatch.teamA || "");
                const apiB = normalizeTeamName(apiMatch.teamB || "");
                const dbA = normalizeTeamName(m.teamA);
                const dbB = normalizeTeamName(m.teamB);
                const teamsMatch = (apiA === dbA && apiB === dbB) || (apiA === dbB && apiB === dbA);
                const timeDiff = apiMatch.kickoffTime ? Math.abs(new Date(m.matchTime).getTime() - new Date(apiMatch.kickoffTime).getTime()) : Infinity;
                return teamsMatch && timeDiff <= 24 * 60 * 60 * 1000;
              });
              p5.forEach(m => cands.push({ m, priority: 5 }));
            }
          }
        }
      }

      apiCandidatesMap.set(apiMatch.providerMatchId, cands);
      cands.forEach(cand => {
        const list = localMatchClaims.get(cand.m.id) || [];
        list.push(apiMatch.providerMatchId!);
        localMatchClaims.set(cand.m.id, list);
      });
    }

    // Construct comparison report items
    const matchedLocalIds = new Set<string>();

    for (const apiMatch of primaryFixtures) {
      if (!apiMatch.providerMatchId) continue;
      const cands = apiCandidatesMap.get(apiMatch.providerMatchId) || [];

      // Scenario A: Missing local match
      if (cands.length === 0) {
        summary.missingLocal++;
        items.push({
          localId: null,
          apiId: apiMatch.providerMatchId,
          currentTeamA: null,
          currentTeamB: null,
          proposedTeamA: apiMatch.teamA,
          proposedTeamB: apiMatch.teamB,
          currentKickoff: null,
          proposedKickoff: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).toISOString() : null,
          provider: primaryProvider,
          confidence: "None",
          action: "CREATE",
          reason: "No local placeholder or match found matching stage or teams.",
        });
        continue;
      }

      // Scenario B: Ambiguous local match (Multiple matches map to one API match)
      if (cands.length > 1) {
        summary.ambiguousSkipped++;
        cands.forEach(cand => {
          items.push({
            localId: cand.m.id,
            apiId: apiMatch.providerMatchId,
            currentTeamA: cand.m.teamA,
            currentTeamB: cand.m.teamB,
            proposedTeamA: apiMatch.teamA,
            proposedTeamB: apiMatch.teamB,
            currentKickoff: new Date(cand.m.matchTime).toISOString(),
            proposedKickoff: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).toISOString() : null,
            provider: primaryProvider,
            confidence: `Priority ${cand.priority}`,
            action: "AMBIGUOUS",
            reason: `Multiple local matches fit this API fixture (Ambiguous candidates: ${cands.map(c => c.m.id).join(", ")})`,
          });
        });
        continue;
      }

      // Unique candidate found!
      const cand = cands[0];
      const dbMatch = cand.m;

      // Scenario C: Ambiguous in reverse (This local match is claimed by multiple API matches)
      const claims = localMatchClaims.get(dbMatch.id) || [];
      if (claims.length > 1) {
        summary.ambiguousSkipped++;
        items.push({
          localId: dbMatch.id,
          apiId: apiMatch.providerMatchId,
          currentTeamA: dbMatch.teamA,
          currentTeamB: dbMatch.teamB,
          proposedTeamA: apiMatch.teamA,
          proposedTeamB: apiMatch.teamB,
          currentKickoff: new Date(dbMatch.matchTime).toISOString(),
          proposedKickoff: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).toISOString() : null,
          provider: primaryProvider,
          confidence: `Priority ${cand.priority}`,
          action: "AMBIGUOUS",
          reason: `Local match matches multiple API fixtures (Claimed by API IDs: ${claims.join(", ")})`,
        });
        continue;
      }

      matchedLocalIds.add(dbMatch.id);

      // 4. Resolve Fallback and Conflict Detection
      let finalProposedA = apiMatch.teamA;
      let finalProposedB = apiMatch.teamB;
      let activeProviderSource = primaryProvider;
      let hasConflict = false;
      let conflictReason = "";

      const primaryIsTbd = isPlaceholderTeam(apiMatch.teamA) || isPlaceholderTeam(apiMatch.teamB);

      // Collect names from all fallbacks
      const fallbackDetails: { provider: string; teamA: string | null; teamB: string | null }[] = [];
      fallbackProvidersList.forEach(fb => {
        const equiv = findEquivalentFixture(apiMatch, fb.fixtures);
        if (equiv) {
          fallbackDetails.push({ provider: fb.name, teamA: equiv.teamA, teamB: equiv.teamB });
        }
      });

      // Verify disagreements (conflicts)
      const nonTbdFallbacks = fallbackDetails.filter(d => !isPlaceholderTeam(d.teamA) && !isPlaceholderTeam(d.teamB));
      
      if (!primaryIsTbd) {
        // Primary is NOT TBD. But verify if any fallback disagrees with the primary
        const conflictingFallbacks = nonTbdFallbacks.filter(d => 
          normalizeTeamName(d.teamA || "") !== normalizeTeamName(apiMatch.teamA || "") ||
          normalizeTeamName(d.teamB || "") !== normalizeTeamName(apiMatch.teamB || "")
        );
        if (conflictingFallbacks.length > 0) {
          hasConflict = true;
          conflictReason = `Provider Conflict: ${primaryProvider} shows '${apiMatch.teamA} vs ${apiMatch.teamB}', ${conflictingFallbacks.map(f => `${f.provider} shows '${f.teamA} vs ${f.teamB}'`).join(", ")}`;
        }
      } else {
        // Primary IS TBD. Check if fallbacks have real team names!
        if (nonTbdFallbacks.length > 0) {
          // Verify if they agree amongst themselves
          const first = nonTbdFallbacks[0];
          const disagrees = nonTbdFallbacks.filter(d => 
            normalizeTeamName(d.teamA || "") !== normalizeTeamName(first.teamA || "") ||
            normalizeTeamName(d.teamB || "") !== normalizeTeamName(first.teamB || "")
          );

          if (disagrees.length > 0) {
            hasConflict = true;
            conflictReason = `Provider Conflict (TBD fallback mismatch): ${nonTbdFallbacks.map(f => `${f.provider} shows '${f.teamA} vs ${f.teamB}'`).join(", ")}`;
          } else {
            // They agree on real names! Safe update from fallback provider.
            finalProposedA = first.teamA;
            finalProposedB = first.teamB;
            activeProviderSource = first.provider;
          }
        }
      }

      // Check if update is risky (changing real team names when predictions exist)
      const isLocalPlaceholder = isPlaceholderTeam(dbMatch.teamA) || isPlaceholderTeam(dbMatch.teamB);
      const isApiPlaceholder = isPlaceholderTeam(finalProposedA) || isPlaceholderTeam(finalProposedB);
      
      const teamANameDiffers = normalizeTeamName(dbMatch.teamA) !== normalizeTeamName(finalProposedA || "");
      const teamBNameDiffers = normalizeTeamName(dbMatch.teamB) !== normalizeTeamName(finalProposedB || "");
      const namesDiffer = teamANameDiffers || teamBNameDiffers;

      const predictionCount = dbMatch.predictions.length;

      let action: "UPDATE" | "SKIP" | "RISKY" | "PROVIDER_CONFLICT" = "SKIP";
      let reason = "Already up to date and correct.";

      if (hasConflict) {
        action = "PROVIDER_CONFLICT";
        reason = conflictReason;
        summary.providerConflicts++;
      } else if (dbMatch.status === MatchStatus.COMPLETED) {
        action = "SKIP";
        reason = "Match completed. Safe updates locked to prevent result modification.";
      } else if (!isApiPlaceholder && isLocalPlaceholder) {
        action = "UPDATE";
        reason = activeProviderSource === primaryProvider 
          ? "Replacing TBD placeholder names with confirmed qualified teams."
          : `SAFE_UPDATE_AVAILABLE: Updated placeholder using fallback provider (${activeProviderSource}).`;
      } else if (!isLocalPlaceholder && namesDiffer) {
        if (predictionCount > 0) {
          action = "RISKY";
          reason = `Fixture has ${predictionCount} active predictions. Changing real team names requires manual admin review.`;
          summary.riskySkipped++;
        } else {
          action = "UPDATE";
          reason = `Updating team names (${activeProviderSource}) (0 predictions, safe to update).`;
        }
      } else {
        // Kickoff time differences check
        const dbTime = new Date(dbMatch.matchTime).getTime();
        const apiTime = apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).getTime() : null;
        if (apiTime && dbTime !== apiTime) {
          action = "UPDATE";
          reason = `Syncing kickoff date/time with ${activeProviderSource} official schedule.`;
        }
      }

      if (action === "UPDATE") {
        summary.safeUpdatesIdentified++;
      }

      items.push({
        localId: dbMatch.id,
        apiId: apiMatch.providerMatchId,
        currentTeamA: dbMatch.teamA,
        currentTeamB: dbMatch.teamB,
        proposedTeamA: finalProposedA,
        proposedTeamB: finalProposedB,
        currentKickoff: new Date(dbMatch.matchTime).toISOString(),
        proposedKickoff: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).toISOString() : null,
        provider: activeProviderSource,
        confidence: `Priority ${cand.priority}`,
        action,
        reason,
      });

      // 5. Apply mode updates
      if (applyUpdate && action === "UPDATE") {
        const canonicalA = getCanonicalTeamName(finalProposedA || "");
        const canonicalB = getCanonicalTeamName(finalProposedB || "");
        const sortedTeams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
        const dateKey = (apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime) : new Date(dbMatch.matchTime)).toISOString().split("T")[0];

        console.log(`[RECONCILE] Applying update for match ID: ${dbMatch.id} using provider: ${activeProviderSource}`);
        console.log(`[RECONCILE] Teams. Before: "${dbMatch.teamA} vs ${dbMatch.teamB}". After: "${canonicalA} vs ${canonicalB}"`);
        console.log(`[RECONCILE] Kickoff. Before: ${new Date(dbMatch.matchTime).toISOString()}. After: ${apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime).toISOString() : "no change"}`);

        await prisma.match.update({
          where: { id: dbMatch.id },
          data: {
            teamA: canonicalA,
            teamB: canonicalB,
            normalizedTeamA: sortedTeams[0],
            normalizedTeamB: sortedTeams[1],
            matchDateKey: dateKey,
            apiProvider: activeProviderSource,
            apiMatchId: apiMatch.providerMatchId,
            matchTime: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime) : dbMatch.matchTime,
            predictionDeadline: apiMatch.kickoffTime ? new Date(apiMatch.kickoffTime) : dbMatch.predictionDeadline,
            stage: apiMatch.stage as MatchStage,
            isKnockout: apiMatch.stage !== MatchStage.GROUP,
          },
        });
        
        summary.updatesApplied++;
      }
    }

    // List unmatched local matches (for completeness of report)
    for (const dbMatch of dbMatches) {
      if (!matchedLocalIds.has(dbMatch.id)) {
        items.push({
          localId: dbMatch.id,
          apiId: dbMatch.apiMatchId,
          currentTeamA: dbMatch.teamA,
          currentTeamB: dbMatch.teamB,
          proposedTeamA: null,
          proposedTeamB: null,
          currentKickoff: new Date(dbMatch.matchTime).toISOString(),
          proposedKickoff: null,
          provider: "unknown",
          confidence: "None",
          action: "SKIP",
          reason: "No matching provider fixture found in API.",
        });
      }
    }

    return { success: true, summary, items };

  } catch (error: any) {
    console.error("Fixture reconciliation fatal error:", error);
    return { success: false, error: `Failed to reconcile fixtures: ${error.message || error}`, summary, items };
  }
}
