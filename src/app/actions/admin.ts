"use server";

import { prisma } from "@/lib/db";
import { verifyAdminAction } from "@/lib/auth";
import { getResultFromScore, calculateMatchPoints, recalculateAllPoints } from "@/lib/scoring";
import { revalidatePath, revalidateTag } from "next/cache";
import { Outcome, MatchStatus, StreamSourceType } from "@prisma/client";
import { runMatchSync, runKnockoutFixtureSync } from "@/lib/match-sync";

function isValidHttpUrl(stringStr: string | null | undefined): boolean {
  if (!stringStr) return true;
  const trimmed = stringStr.trim();
  if (trimmed === "") return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

export async function createMatch(prevState: any, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const teamA = formData.get("teamA")?.toString().trim();
  const teamB = formData.get("teamB")?.toString().trim();
  const matchTimeInput = formData.get("matchTime")?.toString();
  const predictionDeadlineInput = formData.get("predictionDeadline")?.toString();
  const group = formData.get("group")?.toString().trim() || null;
  const venue = formData.get("venue")?.toString().trim() || null;

  const stage = (formData.get("stage")?.toString() || "GROUP") as any;
  const isKnockout = formData.get("isKnockout") === "true";
  const decidedBy = (formData.get("decidedBy")?.toString() || "NORMAL_TIME") as any;
  const winnerTeam = formData.get("winnerTeam")?.toString().trim() || null;

  const officialMatchUrl = formData.get("officialMatchUrl")?.toString().trim() || null;
  const officialBroadcasterUrl = formData.get("officialBroadcasterUrl")?.toString().trim() || null;
  const liveCoverageUrl = formData.get("liveCoverageUrl")?.toString().trim() || null;
  const broadcasterName = formData.get("broadcasterName")?.toString().trim() || null;
  const broadcasterRegion = formData.get("broadcasterRegion")?.toString().trim() || null;
  const coverageNote = formData.get("coverageNote")?.toString().trim() || null;
  const streamSourceType = (formData.get("streamSourceType")?.toString() as StreamSourceType) || StreamSourceType.NONE;

  if (!teamA || !teamB || !matchTimeInput || !predictionDeadlineInput) {
    return { success: false, error: "All fields are required." };
  }

  if (!isValidHttpUrl(officialMatchUrl) || !isValidHttpUrl(officialBroadcasterUrl) || !isValidHttpUrl(liveCoverageUrl)) {
    return { success: false, error: "Invalid live coverage URL. Only http:// and https:// links are allowed." };
  }

  const matchTime = new Date(matchTimeInput);
  const predictionDeadline = new Date(predictionDeadlineInput);

  if (isNaN(matchTime.getTime()) || isNaN(predictionDeadline.getTime())) {
    return { success: false, error: "Invalid date format." };
  }

  if (predictionDeadline > matchTime) {
    return { success: false, error: "Prediction deadline cannot be after the match start time." };
  }

  try {
    const canonicalA = getCanonicalTeamName(teamA);
    const canonicalB = getCanonicalTeamName(teamB);
    const teams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
    const matchDateKey = matchTime.toISOString().split("T")[0];

    if (winnerTeam && winnerTeam !== canonicalA && winnerTeam !== canonicalB) {
      return { success: false, error: `Winner team must be either "${canonicalA}" or "${canonicalB}".` };
    }

    await prisma.match.create({
      data: {
        teamA: canonicalA,
        teamB: canonicalB,
        matchTime,
        predictionDeadline,
        status: MatchStatus.UPCOMING,
        group,
        venue,
        source: "Admin Panel",
        sourceUpdatedAt: new Date(),
        officialMatchUrl,
        officialBroadcasterUrl,
        liveCoverageUrl,
        broadcasterName,
        broadcasterRegion,
        coverageNote,
        streamSourceType,
        normalizedTeamA: teams[0],
        normalizedTeamB: teams[1],
        matchDateKey,
        stage,
        isKnockout,
        decidedBy,
        winnerTeam,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");

    try {
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {}

    return { success: true };
  } catch (error) {
    console.error("Create match error:", error);
    return { success: false, error: "Failed to create match." };
  }
}

export async function updateMatch(matchId: string, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const teamA = formData.get("teamA")?.toString().trim();
  const teamB = formData.get("teamB")?.toString().trim();
  const matchTimeInput = formData.get("matchTime")?.toString();
  const predictionDeadlineInput = formData.get("predictionDeadline")?.toString();
  const status = formData.get("status")?.toString() as MatchStatus;
  const group = formData.get("group")?.toString().trim() || null;
  const venue = formData.get("venue")?.toString().trim() || null;

  const stage = (formData.get("stage")?.toString() || "GROUP") as any;
  const isKnockout = formData.get("isKnockout") === "true";
  const decidedBy = (formData.get("decidedBy")?.toString() || "NORMAL_TIME") as any;
  const winnerTeam = formData.get("winnerTeam")?.toString().trim() || null;

  const officialMatchUrl = formData.get("officialMatchUrl")?.toString().trim() || null;
  const officialBroadcasterUrl = formData.get("officialBroadcasterUrl")?.toString().trim() || null;
  const liveCoverageUrl = formData.get("liveCoverageUrl")?.toString().trim() || null;
  const broadcasterName = formData.get("broadcasterName")?.toString().trim() || null;
  const broadcasterRegion = formData.get("broadcasterRegion")?.toString().trim() || null;
  const coverageNote = formData.get("coverageNote")?.toString().trim() || null;
  const streamSourceType = (formData.get("streamSourceType")?.toString() as StreamSourceType) || StreamSourceType.NONE;

  if (!teamA || !teamB || !matchTimeInput || !predictionDeadlineInput || !status) {
    return { success: false, error: "All fields are required." };
  }

  if (!isValidHttpUrl(officialMatchUrl) || !isValidHttpUrl(officialBroadcasterUrl) || !isValidHttpUrl(liveCoverageUrl)) {
    return { success: false, error: "Invalid live coverage URL. Only http:// and https:// links are allowed." };
  }

  const matchTime = new Date(matchTimeInput);
  let predictionDeadline = new Date(predictionDeadlineInput);

  if (isNaN(matchTime.getTime()) || isNaN(predictionDeadline.getTime())) {
    return { success: false, error: "Invalid date format." };
  }

  // When admin enters a new matchTime for POSTPONED, predictionDeadline = new matchTime
  if (status === MatchStatus.POSTPONED) {
    predictionDeadline = matchTime;
  }

  if (predictionDeadline > matchTime) {
    return { success: false, error: "Prediction deadline cannot be after the match start time." };
  }

  try {
    const canonicalA = getCanonicalTeamName(teamA);
    const canonicalB = getCanonicalTeamName(teamB);
    const teams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
    const matchDateKey = matchTime.toISOString().split("T")[0];

    if (winnerTeam && winnerTeam !== canonicalA && winnerTeam !== canonicalB) {
      return { success: false, error: `Winner team must be either "${canonicalA}" or "${canonicalB}".` };
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamA: canonicalA,
        teamB: canonicalB,
        matchTime,
        predictionDeadline,
        status,
        group,
        venue,
        source: "Admin Panel",
        sourceUpdatedAt: new Date(),
        scoreSource: "ADMIN",
        officialMatchUrl,
        officialBroadcasterUrl,
        liveCoverageUrl,
        broadcasterName,
        broadcasterRegion,
        coverageNote,
        streamSourceType,
        normalizedTeamA: teams[0],
        normalizedTeamB: teams[1],
        matchDateKey,
        stage,
        isKnockout,
        decidedBy,
        winnerTeam,
      },
    });

    // If marked as COMPLETED or CANCELLED, calculate points. Otherwise, reset them.
    if (status === MatchStatus.COMPLETED || status === MatchStatus.CANCELLED) {
      await calculateMatchPoints(matchId);
    } else {
      await prisma.prediction.updateMany({
        where: { matchId },
        data: {
          pointsAwarded: 0,
          predictionResult: null,
          isCalculated: false,
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    try {
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {}

    return { success: true };
  } catch (error) {
    console.error("Update match error:", error);
    return { success: false, error: "Failed to update match." };
  }
}

export async function deleteMatch(matchId: string) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    await prisma.match.delete({
      where: { id: matchId },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");

    try {
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {}

    return { success: true };
  } catch (error) {
    console.error("Delete match error:", error);
    return { success: false, error: "Failed to delete match." };
  }
}

export async function submitMatchResult(matchId: string, formData: FormData) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const scoreAString = formData.get("scoreA")?.toString();
  const scoreBString = formData.get("scoreB")?.toString();
  const status = formData.get("status")?.toString() as MatchStatus;

  const stage = formData.get("stage")?.toString() as any;
  const isKnockout = formData.get("isKnockout") === "true";
  const decidedBy = formData.get("decidedBy")?.toString() as any;
  const winnerTeam = formData.get("winnerTeam")?.toString().trim() || null;

  // Penalty results fields
  const penaltyScoreAString = formData.get("penaltyScoreA")?.toString();
  const penaltyScoreBString = formData.get("penaltyScoreB")?.toString();

  if (!status) {
    return { success: false, error: "Status is required." };
  }

  const scoreA = scoreAString && scoreAString.trim() !== "" ? parseInt(scoreAString) : null;
  const scoreB = scoreBString && scoreBString.trim() !== "" ? parseInt(scoreBString) : null;

  const penaltyScoreA = penaltyScoreAString && penaltyScoreAString.trim() !== "" ? parseInt(penaltyScoreAString) : null;
  const penaltyScoreB = penaltyScoreBString && penaltyScoreBString.trim() !== "" ? parseInt(penaltyScoreBString) : null;

  // COMPLETED requires scores
  if (status === MatchStatus.COMPLETED && (scoreA === null || scoreB === null)) {
    return { success: false, error: "Final score is required before completing a match." };
  }

  if (scoreA !== null && scoreB !== null) {
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      return { success: false, error: "Scores must be non-negative integers." };
    }
    if (scoreA > 30 || scoreB > 30) {
      return { success: false, error: "Scores cannot be greater than 30." };
    }
  }

  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return { success: false, error: "Match not found." };
    }

    if (winnerTeam && winnerTeam !== match.teamA && winnerTeam !== match.teamB) {
      return { success: false, error: `Winner team must be either "${match.teamA}" or "${match.teamB}".` };
    }

    // Validate penalty shootout results
    if (status === MatchStatus.COMPLETED && isKnockout && decidedBy === "PENALTIES") {
      if (scoreA !== scoreB) {
        return { success: false, error: "A match decided by penalties must end as a Draw before penalties." };
      }
      if (penaltyScoreA === null || penaltyScoreB === null) {
        return { success: false, error: "Penalty shootout scores are required when decided by penalties." };
      }
      if (isNaN(penaltyScoreA) || isNaN(penaltyScoreB) || penaltyScoreA < 0 || penaltyScoreB < 0) {
        return { success: false, error: "Penalty shootout scores must be non-negative integers." };
      }
      if (penaltyScoreA === penaltyScoreB) {
        return { success: false, error: "Penalty shootout scores cannot be equal." };
      }
      if (!winnerTeam) {
        return { success: false, error: "Winner team is required for a penalty shootout." };
      }
      const expectedWinner = penaltyScoreA > penaltyScoreB ? match.teamA : match.teamB;
      if (winnerTeam !== expectedWinner) {
        return { success: false, error: `Winner team must match the higher penalty shootout score (expected "${expectedWinner}").` };
      }
    }

    let result = (scoreA !== null && scoreB !== null) ? getResultFromScore(scoreA, scoreB) : null;
    if (isKnockout && winnerTeam) {
      if (winnerTeam === match.teamA) {
        result = Outcome.TEAM_A;
      } else if (winnerTeam === match.teamB) {
        result = Outcome.TEAM_B;
      }
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamAScore: scoreA,
        teamBScore: scoreB,
        status: status,
        result: result,
        scoreSource: "ADMIN",
        stage: stage || undefined,
        isKnockout: isKnockout,
        decidedBy: decidedBy || undefined,
        winnerTeam: winnerTeam,
        penaltyTeamAScore: isKnockout && decidedBy === "PENALTIES" ? penaltyScoreA : null,
        penaltyTeamBScore: isKnockout && decidedBy === "PENALTIES" ? penaltyScoreB : null,
      },
    });

    // Handle points calculation based on status
    if (status === MatchStatus.COMPLETED || status === MatchStatus.CANCELLED) {
      await calculateMatchPoints(matchId);
    } else {
      // If changed to LIVE, UPCOMING, or POSTPONED, reset prediction points
      await prisma.prediction.updateMany({
        where: { matchId },
        data: {
          pointsAwarded: 0,
          predictionResult: null,
          isCalculated: false,
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    try {
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {}

    return { success: true };
  } catch (error) {
    console.error("Submit result error:", error);
    return { success: false, error: "Failed to submit result." };
  }
}

export async function triggerRecalculate() {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    await recalculateAllPoints();

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/my-predictions");

    try {
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {}

    return { success: true };
  } catch (error) {
    console.error("Recalculate error:", error);
    return { success: false, error: "Failed to recalculate points." };
  }
}

export type NormalizedApiMatch = {
  apiProvider: "worldcup26.ir";
  apiMatchId: string | null;
  teamA: string;
  teamB: string;
  kickoffUtc: Date | null;
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  scoreA: number | null;
  scoreB: number | null;
  isCancelled: boolean;
  isPostponed: boolean;
  officialMatchUrl?: string | null;
  liveCoverageUrl?: string | null;
};

function parseLocalDate(localDateStr: string, stadiumId: string): Date | null {
  if (!localDateStr) return null;
  const match = localDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [_, month, day, year, hour, minute] = match;
  const localUtcTimestamp = Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );

  const STADIUM_TIMEZONES: Record<string, number> = {
    "1": -6,  // Estadio Azteca, Mexico City (UTC-6)
    "2": -6,  // Estadio Akron, Guadalajara (UTC-6)
    "3": -6,  // Estadio BBVA, Monterrey (UTC-6)
    "4": -5,  // AT&T Stadium, Dallas (CDT: UTC-5)
    "5": -5,  // NRG Stadium, Houston (CDT: UTC-5)
    "6": -5,  // GEHA Field at Arrowhead Stadium, Kansas City (CDT: UTC-5)
    "7": -4,  // Mercedes-Benz Stadium, Atlanta (EDT: UTC-4)
    "8": -4,  // Hard Rock Stadium, Miami (EDT: UTC-4)
    "9": -4,  // Gillette Stadium, Boston (EDT: UTC-4)
    "10": -4, // Lincoln Financial Field, Philadelphia (EDT: UTC-4)
    "11": -4, // MetLife Stadium, New York/New Jersey (EDT: UTC-4)
    "12": -4, // BMO Field, Toronto (EDT: UTC-4)
    "13": -7, // BC Place, Vancouver (PDT: UTC-7)
    "14": -7, // Lumen Field, Seattle (PDT: UTC-7)
    "15": -7, // Levi's Stadium, San Francisco (PDT: UTC-7)
    "16": -7, // SoFi Stadium, Los Angeles (PDT: UTC-7)
  };

  const offset = STADIUM_TIMEZONES[stadiumId] || 0;
  return new Date(localUtcTimestamp - offset * 60 * 60 * 1000);
}

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

function getCanonicalTeamName(name: string): string {
  if (!name) return "";
  const clean = name.trim();
  const normalized = normalizeTeamName(clean);

  const canonicalMap: Record<string, string> = {
    "usa": "USA",
    "korea republic": "Korea Republic",
    "czechia": "Czechia",
    "türkiye": "Türkiye",
    "dr congo": "DR Congo"
  };

  if (canonicalMap[normalized]) {
    return canonicalMap[normalized];
  }
  return clean;
}

function toNormalizedApiMatch(game: any): NormalizedApiMatch {
  const scoreAStr = game.home_score;
  const scoreBStr = game.away_score;
  const scoreA = (scoreAStr !== undefined && scoreAStr !== null && scoreAStr !== "null" && scoreAStr !== "") ? parseInt(scoreAStr) : null;
  const scoreB = (scoreBStr !== undefined && scoreBStr !== null && scoreBStr !== "null" && scoreBStr !== "") ? parseInt(scoreBStr) : null;

  const finishedStr = String(game.finished).toUpperCase();
  const timeElapsedStr = String(game.time_elapsed).toLowerCase();

  let status: "UPCOMING" | "LIVE" | "COMPLETED" = "UPCOMING";
  if (finishedStr === "TRUE" || timeElapsedStr === "finished") {
    status = "COMPLETED";
  } else if (timeElapsedStr === "live" || (timeElapsedStr !== "notstarted" && timeElapsedStr !== "")) {
    status = "LIVE";
  }

  const isCancelled = timeElapsedStr === "cancelled" || timeElapsedStr === "void";
  const isPostponed = timeElapsedStr === "postponed" || timeElapsedStr === "delayed";

  const rawOfficialUrl = game.official_match_url || game.officialMatchUrl || game.match_url || game.url || null;
  const rawLiveUrl = game.live_coverage_url || game.liveCoverageUrl || null;
  const officialMatchUrl = isValidHttpUrl(rawOfficialUrl) ? rawOfficialUrl : null;
  const liveCoverageUrl = isValidHttpUrl(rawLiveUrl) ? rawLiveUrl : null;

  return {
    apiProvider: "worldcup26.ir",
    apiMatchId: game.id ? String(game.id) : null,
    teamA: getCanonicalTeamName(game.home_team_name_en || ""),
    teamB: getCanonicalTeamName(game.away_team_name_en || ""),
    kickoffUtc: parseLocalDate(game.local_date, String(game.stadium_id)),
    status,
    scoreA: scoreA !== null && !isNaN(scoreA) ? scoreA : null,
    scoreB: scoreB !== null && !isNaN(scoreB) ? scoreB : null,
    isCancelled,
    isPostponed,
    officialMatchUrl,
    liveCoverageUrl,
  };
}

function findDbMatch(normalized: NormalizedApiMatch, dbMatches: any[]): any {
  if (normalized.apiMatchId) {
    const match = dbMatches.find(
      m => m.apiProvider === normalized.apiProvider && m.apiMatchId === normalized.apiMatchId
    );
    if (match) return match;
  }

  const apiA = normalizeTeamName(normalized.teamA);
  const apiB = normalizeTeamName(normalized.teamB);
  const teams = [apiA, apiB].sort();
  const dateKey = normalized.kickoffUtc ? normalized.kickoffUtc.toISOString().split("T")[0] : null;

  if (dateKey) {
    const match = dbMatches.find(m => {
      if (m.normalizedTeamA && m.normalizedTeamB && m.matchDateKey) {
        return m.normalizedTeamA === teams[0] && m.normalizedTeamB === teams[1] && m.matchDateKey === dateKey;
      }
      return false;
    });
    if (match) return match;
  }

  const nameMatched = dbMatches.filter(m => {
    const dbA = normalizeTeamName(m.teamA);
    const dbB = normalizeTeamName(m.teamB);
    return (apiA === dbA && apiB === dbB) || (apiA === dbB && apiB === dbA);
  });

  if (nameMatched.length === 0) return null;
  if (nameMatched.length === 1) return nameMatched[0];

  if (normalized.kickoffUtc) {
    let bestMatch = null;
    let minDiff = Infinity;
    for (const m of nameMatched) {
      if (m.matchTime) {
        const diff = Math.abs(new Date(m.matchTime).getTime() - normalized.kickoffUtc.getTime());
        if (diff < 24 * 60 * 60 * 1000 && diff < minDiff) {
          minDiff = diff;
          bestMatch = m;
        }
      }
    }
    if (bestMatch) return bestMatch;
  }

  return nameMatched[0];
}

export async function syncMatchesWithApi(providerName?: string) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    const selectedProvider = providerName || process.env.SYNC_PROVIDER || "worldcup26.ir";
    const res = await runMatchSync(selectedProvider);
    
    try {
      revalidatePath("/dashboard");
      revalidatePath("/matches");
      revalidatePath("/admin");
      revalidatePath("/leaderboard");
      revalidatePath("/my-predictions");
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {
      // Ignore revalidation errors when running outside of Next.js server context
    }

    return res;
  } catch (error: any) {
    console.error("API sync fatal error:", error);
    return { success: false, error: `Failed to execute sync: ${error.message || error}` };
  }
}

export async function syncKnockoutFixturesWithApi() {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    const res = await runKnockoutFixtureSync();

    try {
      revalidatePath("/dashboard");
      revalidatePath("/matches");
      revalidatePath("/admin");
      revalidatePath("/leaderboard");
      revalidatePath("/my-predictions");
      (revalidateTag as any)("leaderboard");
      (revalidateTag as any)("raw-matches");
    } catch (e) {
      // Ignore cache clear error
    }

    return res;
  } catch (error: any) {
    console.error("Knockout fixture sync fatal error:", error);
    return { success: false, error: `Failed to execute sync: ${error.message || error}` };
  }
}

export async function reconcileFixtures(provider: string, apply: boolean) {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    const { auditAndReconcileFixtures } = require("@/lib/match-reconcile");
    const res = await auditAndReconcileFixtures(provider, apply);

    if (apply && res.success) {
      try {
        revalidatePath("/dashboard");
        revalidatePath("/matches");
        revalidatePath("/admin");
        revalidatePath("/leaderboard");
        revalidatePath("/my-predictions");
        (revalidateTag as any)("leaderboard");
        (revalidateTag as any)("raw-matches");
      } catch (e) {
        // Ignore cache clear error
      }
    }

    return res;
  } catch (error: any) {
    console.error("Fixture reconciliation action fatal error:", error);
    return { success: false, error: `Failed to reconcile fixtures: ${error.message || error}` };
  }
}
