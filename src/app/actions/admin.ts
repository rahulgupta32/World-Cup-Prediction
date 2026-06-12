"use server";

import { prisma } from "@/lib/db";
import { verifyAdminAction } from "@/lib/auth";
import { getResultFromScore, calculateMatchPoints, recalculateAllPoints } from "@/lib/scoring";
import { revalidatePath } from "next/cache";
import { Outcome, MatchStatus, StreamSourceType } from "@prisma/client";

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
    await prisma.match.create({
      data: {
        teamA,
        teamB,
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
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/matches");
    revalidatePath("/admin");

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
    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamA,
        teamB,
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

  if (!status) {
    return { success: false, error: "Status is required." };
  }

  const scoreA = scoreAString && scoreAString.trim() !== "" ? parseInt(scoreAString) : null;
  const scoreB = scoreBString && scoreBString.trim() !== "" ? parseInt(scoreBString) : null;

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
    const result = (scoreA !== null && scoreB !== null) ? getResultFromScore(scoreA, scoreB) : null;

    await prisma.match.update({
      where: { id: matchId },
      data: {
        teamAScore: scoreA,
        teamBScore: scoreB,
        status: status,
        result: result,
        scoreSource: "ADMIN",
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
    "czech republic": "czechia",
    "united states": "usa",
    "united states of america": "usa",
    "turkey": "turkiye",
    "turkiye": "turkiye",
    "democratic republic of the congo": "dr congo",
    "congo dr": "dr congo",
  };

  if (mapping[clean]) {
    return mapping[clean];
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
    teamA: game.home_team_name_en || "",
    teamB: game.away_team_name_en || "",
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

  const nameMatched = dbMatches.filter(m => {
    const apiA = normalizeTeamName(normalized.teamA);
    const apiB = normalizeTeamName(normalized.teamB);
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

export async function syncMatchesWithApi() {
  const { authenticated } = await verifyAdminAction();
  if (!authenticated) {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const summary = {
    totalFetched: 0,
    matched: 0,
    updatedLive: 0,
    completed: 0,
    pointsCalculated: 0,
    skippedUpcoming: 0,
    skippedAdminFinalized: 0,
    unmatched: 0,
    errors: [] as string[],
  };

  try {
    // Fetch API with 10-second timeout
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
      if (err.name === "AbortError") {
        return { success: false, error: "API request timed out (10s limit exceeded)." };
      }
      return { success: false, error: `Failed to connect to API: ${err.message || err}` };
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `API returned error status: ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.games)) {
      return { success: false, error: "Invalid API response format. Missing games list." };
    }

    const apiGames = data.games;
    summary.totalFetched = apiGames.length;

    // Fetch all matches from DB
    const dbMatches = await prisma.match.findMany();

    // Iterate and update matches
    for (const game of apiGames) {
      try {
        const normalized = toNormalizedApiMatch(game);
        
        // Find match in DB
        const match = findDbMatch(normalized, dbMatches);
        if (!match) {
          console.warn(`Unmatched API game: ${normalized.teamA} vs ${normalized.teamB} (API ID: ${normalized.apiMatchId})`);
          summary.unmatched++;
          continue;
        }

        summary.matched++;

        // Admin Override check: If match.scoreSource = ADMIN and match.status = COMPLETED, do not overwrite the score from API
        if (match.scoreSource === "ADMIN" && match.status === "COMPLETED") {
          summary.skippedAdminFinalized++;
          continue;
        }

        // Determine home/away score assignment based on team orientation
        const isSwapped = normalizeTeamName(normalized.teamA) === normalizeTeamName(match.teamB);
        const apiScoreA = isSwapped ? normalized.scoreB : normalized.scoreA;
        const apiScoreB = isSwapped ? normalized.scoreA : normalized.scoreB;

        const apiUrls: any = {};
        if (normalized.officialMatchUrl) {
          apiUrls.officialMatchUrl = normalized.officialMatchUrl;
        }
        if (normalized.liveCoverageUrl) {
          apiUrls.liveCoverageUrl = normalized.liveCoverageUrl;
        }

        // Check if API says cancelled or postponed
        if (normalized.isCancelled) {
          summary.errors.push(`Match warning: ${match.teamA} vs ${match.teamB} is marked as CANCELLED/VOID in API. Status updated to CANCELLED.`);
          
          await prisma.match.update({
            where: { id: match.id },
            data: {
              status: MatchStatus.CANCELLED,
              scoreSource: "API",
              apiProvider: "worldcup26.ir",
              apiMatchId: normalized.apiMatchId,
              lastSyncedAt: new Date(),
              ...apiUrls,
            },
          });
          continue;
        }

        if (normalized.isPostponed) {
          summary.errors.push(`Match warning: ${match.teamA} vs ${match.teamB} is marked as POSTPONED/DELAYED in API. Status updated to POSTPONED.`);
          
          await prisma.match.update({
            where: { id: match.id },
            data: {
              status: MatchStatus.POSTPONED,
              scoreSource: "API",
              apiProvider: "worldcup26.ir",
              apiMatchId: normalized.apiMatchId,
              lastSyncedAt: new Date(),
              ...apiUrls,
            },
          });
          continue;
        }

        if (normalized.status === "COMPLETED") {
          // COMPLETED match: require scoreA and scoreB to be valid numbers
          if (apiScoreA === null || apiScoreB === null) {
            summary.errors.push(`Error: Game ${match.teamA} vs ${match.teamB} is finished but scores are invalid/missing.`);
            continue;
          }

          const outcome = getResultFromScore(apiScoreA, apiScoreB);

          // Update match status and scores inside a transaction to keep it safe
          await prisma.$transaction(async (tx) => {
            await tx.match.update({
              where: { id: match.id },
              data: {
                status: MatchStatus.COMPLETED,
                teamAScore: apiScoreA,
                teamBScore: apiScoreB,
                result: outcome,
                scoreSource: "API",
                apiProvider: "worldcup26.ir",
                apiMatchId: normalized.apiMatchId,
                lastSyncedAt: new Date(),
                ...apiUrls,
              },
            });
          });

          // Call calculateMatchPoints transactionally and idempotently
          await calculateMatchPoints(match.id);

          summary.completed++;
          summary.pointsCalculated++;

        } else if (normalized.status === "LIVE") {
          // LIVE match: update scoreA/scoreB only if valid numbers
          const hasValidScores = apiScoreA !== null && apiScoreB !== null;
          await prisma.match.update({
            where: { id: match.id },
            data: {
              status: MatchStatus.LIVE,
              teamAScore: hasValidScores ? apiScoreA : match.teamAScore,
              teamBScore: hasValidScores ? apiScoreB : match.teamBScore,
              scoreSource: "API",
              apiProvider: "worldcup26.ir",
              apiMatchId: normalized.apiMatchId,
              lastSyncedAt: new Date(),
              ...apiUrls,
            },
          });
          summary.updatedLive++;

        } else {
          // UPCOMING / Not started match
          // 1. Do not overwrite POSTPONED or CANCELLED
          if (match.status === MatchStatus.POSTPONED || match.status === MatchStatus.CANCELLED) {
            summary.skippedUpcoming++;
            continue;
          }

          // 2. Do not overwrite manually edited admin data
          if (match.scoreSource === "ADMIN") {
            summary.skippedUpcoming++;
            continue;
          }

          // 3. Update mapping details, and optionally update kickoff time if match is UPCOMING and API kickoff time is valid
          const updateData: any = {
            apiProvider: "worldcup26.ir",
            apiMatchId: normalized.apiMatchId,
            lastSyncedAt: new Date(),
            ...apiUrls,
          };

          if (match.status === MatchStatus.UPCOMING && normalized.kickoffUtc) {
            updateData.matchTime = normalized.kickoffUtc;
            updateData.predictionDeadline = normalized.kickoffUtc;
          }

          await prisma.match.update({
            where: { id: match.id },
            data: updateData,
          });

          summary.skippedUpcoming++;
        }

      } catch (err: any) {
        summary.errors.push(`Error processing game ${game.home_team_name_en} vs ${game.away_team_name_en}: ${err.message || err}`);
      }
    }

    try {
      revalidatePath("/dashboard");
      revalidatePath("/matches");
      revalidatePath("/admin");
      revalidatePath("/leaderboard");
      revalidatePath("/my-predictions");
    } catch (e) {
      // Ignore revalidation errors when running outside of Next.js server context (e.g., during tests)
    }

    return { success: true, summary };

  } catch (error: any) {
    console.error("API sync fatal error:", error);
    return { success: false, error: `Failed to execute sync: ${error.message || error}` };
  }
}
