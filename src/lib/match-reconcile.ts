import { prisma } from "./db";
import { Outcome, MatchStatus, MatchStage } from "@prisma/client";
import { 
  normalizeTeamName, 
  getCanonicalTeamName, 
  toNormalizedApiMatch, 
  getStageFromApiType 
} from "./match-sync";

export type ReconcileItem = {
  localId: string | null;
  apiId: string | null;
  currentTeamA: string | null;
  currentTeamB: string | null;
  proposedTeamA: string | null;
  proposedTeamB: string | null;
  currentKickoff: string | null; // ISO
  proposedKickoff: string | null; // ISO
  confidence: string; // "Priority 1" | "Priority 3" | ...
  action: "UPDATE" | "SKIP" | "AMBIGUOUS" | "RISKY" | "CREATE";
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

export async function auditAndReconcileFixtures(applyUpdate: boolean = false) {
  const summary = {
    totalApiFixtures: 0,
    totalLocalScanned: 0,
    placeholdersFound: 0,
    safeUpdatesIdentified: 0,
    updatesApplied: 0,
    ambiguousSkipped: 0,
    riskySkipped: 0,
    missingLocal: 0,
    errors: [] as string[],
  };

  const items: ReconcileItem[] = [];

  try {
    // 1. Fetch API fixtures with 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let res;
    try {
      res = await fetch("https://worldcup26.ir/get/games", {
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      return { success: false, error: `Failed to connect to API: ${err.message || err}`, summary, items };
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `API returned error status: ${res.status} ${res.statusText}`, summary, items };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.games)) {
      return { success: false, error: "Invalid API response format.", summary, items };
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

    // 3. Map API matches
    const apiMatches = data.games.map((g: any) => {
      const stage = getStageFromApiType(g.type) || MatchStage.GROUP;
      const normalized = toNormalizedApiMatch(g);
      return {
        ...normalized,
        stage,
        venue: g.stadium_id ? String(g.stadium_id) : null,
      };
    });

    summary.totalApiFixtures = apiMatches.length;

    // Two-way candidate mapping to check for ambiguity
    const apiCandidatesMap = new Map<string, { m: any; priority: number }[]>();
    const localMatchClaims = new Map<string, string[]>(); // dbMatchId -> list of apiMatchIds claiming it

    // Scan each API match for local candidates by Priority 1 -> 5
    for (const apiMatch of apiMatches) {
      if (!apiMatch.apiMatchId) continue;
      const cands: { m: any; priority: number }[] = [];

      // Priority 1: Same apiProvider + apiMatchId
      const p1 = dbMatches.filter(m => m.apiProvider === apiMatch.apiProvider && m.apiMatchId === apiMatch.apiMatchId);
      if (p1.length > 0) {
        p1.forEach(m => cands.push({ m, priority: 1 }));
      } else {
        // Priority 2: Same FIFA / match number (which is apiMatchId in our database)
        // Since we store match number in apiMatchId, this matches Priority 1, but check if any match matches it as a string
        const p2 = dbMatches.filter(m => m.apiMatchId === apiMatch.apiMatchId);
        if (p2.length > 0) {
          p2.forEach(m => cands.push({ m, priority: 2 }));
        } else {
          // Priority 3: Same stage/round + same kickoff date/time + same venue
          const p3 = dbMatches.filter(m => {
            const sameStage = m.stage === apiMatch.stage;
            const sameTime = apiMatch.kickoffUtc && Math.abs(new Date(m.matchTime).getTime() - apiMatch.kickoffUtc.getTime()) < 1000;
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
                const apiA = normalizeTeamName(apiMatch.teamA);
                const apiB = normalizeTeamName(apiMatch.teamB);
                const dbA = normalizeTeamName(m.teamA);
                const dbB = normalizeTeamName(m.teamB);
                const teamsMatch = (apiA === dbA && apiB === dbB) || (apiA === dbB && apiB === dbA);
                const timeDiff = apiMatch.kickoffUtc ? Math.abs(new Date(m.matchTime).getTime() - apiMatch.kickoffUtc.getTime()) : Infinity;
                return teamsMatch && timeDiff <= 24 * 60 * 60 * 1000;
              });
              p5.forEach(m => cands.push({ m, priority: 5 }));
            }
          }
        }
      }

      apiCandidatesMap.set(apiMatch.apiMatchId, cands);
      cands.forEach(cand => {
        const list = localMatchClaims.get(cand.m.id) || [];
        list.push(apiMatch.apiMatchId!);
        localMatchClaims.set(cand.m.id, list);
      });
    }

    // Now, construct comparison report items
    const matchedLocalIds = new Set<string>();

    for (const apiMatch of apiMatches) {
      if (!apiMatch.apiMatchId) continue;
      const apiMatchName = `${apiMatch.teamA} vs ${apiMatch.teamB} (${apiMatch.stage})`;
      const cands = apiCandidatesMap.get(apiMatch.apiMatchId) || [];

      // Scenario A: Missing local match (0 candidates matched)
      if (cands.length === 0) {
        summary.missingLocal++;
        items.push({
          localId: null,
          apiId: apiMatch.apiMatchId,
          currentTeamA: null,
          currentTeamB: null,
          proposedTeamA: apiMatch.teamA,
          proposedTeamB: apiMatch.teamB,
          currentKickoff: null,
          proposedKickoff: apiMatch.kickoffUtc ? apiMatch.kickoffUtc.toISOString() : null,
          confidence: "None",
          action: "CREATE",
          reason: "No local placeholder or match found matching stage or teams.",
        });
        continue;
      }

      // Scenario B: Ambiguous local match (Multiple database matches match this one API match)
      if (cands.length > 1) {
        summary.ambiguousSkipped++;
        cands.forEach(cand => {
          items.push({
            localId: cand.m.id,
            apiId: apiMatch.apiMatchId,
            currentTeamA: cand.m.teamA,
            currentTeamB: cand.m.teamB,
            proposedTeamA: apiMatch.teamA,
            proposedTeamB: apiMatch.teamB,
            currentKickoff: new Date(cand.m.matchTime).toISOString(),
            proposedKickoff: apiMatch.kickoffUtc ? apiMatch.kickoffUtc.toISOString() : null,
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
          apiId: apiMatch.apiMatchId,
          currentTeamA: dbMatch.teamA,
          currentTeamB: dbMatch.teamB,
          proposedTeamA: apiMatch.teamA,
          proposedTeamB: apiMatch.teamB,
          currentKickoff: new Date(dbMatch.matchTime).toISOString(),
          proposedKickoff: apiMatch.kickoffUtc ? apiMatch.kickoffUtc.toISOString() : null,
          confidence: `Priority ${cand.priority}`,
          action: "AMBIGUOUS",
          reason: `Local match matches multiple API fixtures (Claimed by API IDs: ${claims.join(", ")})`,
        });
        continue;
      }

      matchedLocalIds.add(dbMatch.id);

      // Check if update is risky (changing real team names when predictions exist)
      const isLocalPlaceholder = isPlaceholderTeam(dbMatch.teamA) || isPlaceholderTeam(dbMatch.teamB);
      const isApiPlaceholder = isPlaceholderTeam(apiMatch.teamA) || isPlaceholderTeam(apiMatch.teamB);
      
      const teamANameDiffers = normalizeTeamName(dbMatch.teamA) !== normalizeTeamName(apiMatch.teamA);
      const teamBNameDiffers = normalizeTeamName(dbMatch.teamB) !== normalizeTeamName(apiMatch.teamB);
      const namesDiffer = teamANameDiffers || teamBNameDiffers;

      const predictionCount = dbMatch.predictions.length;

      let action: "UPDATE" | "SKIP" | "RISKY" = "SKIP";
      let reason = "Already up to date and correct.";

      // Lock completed match result changes
      if (dbMatch.status === MatchStatus.COMPLETED) {
        action = "SKIP";
        reason = "Match completed. Safe updates locked to prevent result modification.";
      } else if (!isApiPlaceholder && isLocalPlaceholder) {
        // Safe placeholder update to actual teams
        action = "UPDATE";
        reason = "Replacing TBD placeholder names with confirmed qualified teams.";
      } else if (!isLocalPlaceholder && namesDiffer) {
        if (predictionCount > 0) {
          action = "RISKY";
          reason = `Fixture has ${predictionCount} active predictions. Changing real team names requires manual admin review.`;
          summary.riskySkipped++;
        } else {
          action = "UPDATE";
          reason = "Updating team names (0 existing predictions, safe to update).";
        }
      } else {
        // Kickoff time differences check
        const dbTime = new Date(dbMatch.matchTime).getTime();
        const apiTime = apiMatch.kickoffUtc ? apiMatch.kickoffUtc.getTime() : null;
        if (apiTime && dbTime !== apiTime) {
          action = "UPDATE";
          reason = "Syncing kickoff date/time with provider official schedule.";
        }
      }

      if (action === "UPDATE") {
        summary.safeUpdatesIdentified++;
      }

      items.push({
        localId: dbMatch.id,
        apiId: apiMatch.apiMatchId,
        currentTeamA: dbMatch.teamA,
        currentTeamB: dbMatch.teamB,
        proposedTeamA: apiMatch.teamA,
        proposedTeamB: apiMatch.teamB,
        currentKickoff: new Date(dbMatch.matchTime).toISOString(),
        proposedKickoff: apiMatch.kickoffUtc ? apiMatch.kickoffUtc.toISOString() : null,
        confidence: `Priority ${cand.priority}`,
        action,
        reason,
      });

      // 4. Apply mode updates
      if (applyUpdate && action === "UPDATE") {
        const canonicalA = getCanonicalTeamName(apiMatch.teamA);
        const canonicalB = getCanonicalTeamName(apiMatch.teamB);
        const sortedTeams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
        const dateKey = (apiMatch.kickoffUtc || new Date(dbMatch.matchTime)).toISOString().split("T")[0];

        console.log(`[RECONCILE] Applying update for match ID: ${dbMatch.id}`);
        console.log(`[RECONCILE] Teams. Before: "${dbMatch.teamA} vs ${dbMatch.teamB}". After: "${canonicalA} vs ${canonicalB}"`);
        console.log(`[RECONCILE] Kickoff. Before: ${new Date(dbMatch.matchTime).toISOString()}. After: ${apiMatch.kickoffUtc ? apiMatch.kickoffUtc.toISOString() : "no change"}`);

        await prisma.match.update({
          where: { id: dbMatch.id },
          data: {
            teamA: canonicalA,
            teamB: canonicalB,
            normalizedTeamA: sortedTeams[0],
            normalizedTeamB: sortedTeams[1],
            matchDateKey: dateKey,
            apiProvider: "worldcup26.ir",
            apiMatchId: apiMatch.apiMatchId,
            matchTime: apiMatch.kickoffUtc || dbMatch.matchTime,
            predictionDeadline: apiMatch.kickoffUtc || dbMatch.predictionDeadline,
            stage: apiMatch.stage,
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
