import { prisma } from "./db";
import { Outcome, MatchStatus, StreamSourceType } from "@prisma/client";
import { getResultFromScore, calculateMatchPoints } from "./scoring";

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

export async function runMatchSync(selectedProvider = "worldcup26.ir") {
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

  const apiKey = process.env.WORLD_CUP_API_KEY || process.env.FOOTBALL_API_KEY;
  const requiresKey = selectedProvider !== "worldcup26.ir";

  if (requiresKey && !apiKey) {
    console.error(`[SYNC] Sync failed: API key is not configured for provider ${selectedProvider}.`);
    return { success: false, error: "API key is not configured." };
  }

  try {
    // 1. Throttling check (database-backed lock: skip if a match was synced in the last 60 seconds)
    const lastSyncedMatch = await prisma.match.findFirst({
      where: {
        lastSyncedAt: { not: null },
      },
      orderBy: {
        lastSyncedAt: "desc",
      },
      select: {
        lastSyncedAt: true,
      },
    });

    if (lastSyncedMatch?.lastSyncedAt) {
      const timeSinceLastSync = Date.now() - new Date(lastSyncedMatch.lastSyncedAt).getTime();
      if (timeSinceLastSync < 60 * 1000) {
        console.log(`[SYNC] Skipped: Sync ran recently (${Math.round(timeSinceLastSync / 1000)}s ago).`);
        return { success: true, skipped: true, reason: "Sync skipped: recently completed." };
      }
    }

    // 2. Fetch API with 10-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    console.log(`[SYNC] Requesting scores from provider: ${selectedProvider}`);
    let res;
    try {
      res = await fetch("https://worldcup26.ir/get/games", {
        cache: "no-store",
        signal: controller.signal,
      });
      console.log(`[SYNC] Provider: ${selectedProvider}, Status Code: ${res.status}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      const errorType = err.name === "AbortError" ? "TimeoutError" : "NetworkError";
      console.error(`[SYNC] Provider: ${selectedProvider}, Error Type: ${errorType}, Error Message: ${err.message || err}`);
      if (err.name === "AbortError") {
        return { success: false, error: "API request timed out (10s limit exceeded)." };
      }
      return { success: false, error: `Failed to connect to API: ${err.message || err}` };
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`[SYNC] Provider: ${selectedProvider}, Error Type: HTTP_${res.status}, Status: ${res.statusText}`);
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

        // Compute normalized and canonical values for duplicate matching and display consistency
        const canonicalA = getCanonicalTeamName(match.teamA);
        const canonicalB = getCanonicalTeamName(match.teamB);
        const teams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
        const dateKey = (normalized.kickoffUtc || new Date(match.matchTime)).toISOString().split("T")[0];

        const normFields = {
          teamA: canonicalA,
          teamB: canonicalB,
          normalizedTeamA: teams[0],
          normalizedTeamB: teams[1],
          matchDateKey: dateKey,
        };

        // Check if API says cancelled or postponed
        if (normalized.isCancelled) {
          if (match.status !== MatchStatus.CANCELLED) {
            await prisma.match.update({
              where: { id: match.id },
              data: {
                status: MatchStatus.CANCELLED,
                scoreSource: "API",
                apiProvider: "worldcup26.ir",
                apiMatchId: normalized.apiMatchId,
                lastSyncedAt: new Date(),
                ...apiUrls,
                ...normFields,
              },
            });
          }
          continue;
        }

        if (normalized.isPostponed) {
          if (match.status !== MatchStatus.POSTPONED) {
            await prisma.match.update({
              where: { id: match.id },
              data: {
                status: MatchStatus.POSTPONED,
                scoreSource: "API",
                apiProvider: "worldcup26.ir",
                apiMatchId: normalized.apiMatchId,
                lastSyncedAt: new Date(),
                ...apiUrls,
                ...normFields,
              },
            });
          }
          continue;
        }

        if (normalized.status === "COMPLETED") {
          if (apiScoreA === null || apiScoreB === null) {
            summary.errors.push(`Error: Game ${match.teamA} vs ${match.teamB} is finished but scores are invalid/missing.`);
            continue;
          }

          // Performance Optimization: Skip writing to DB if match is already marked COMPLETED with identical scores
          if (match.status === MatchStatus.COMPLETED && match.teamAScore === apiScoreA && match.teamBScore === apiScoreB) {
            summary.skippedUpcoming++;
            continue;
          }

          const outcome = getResultFromScore(apiScoreA, apiScoreB);

          // Update match status and scores inside a transaction
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
                ...normFields,
              },
            });
          });

          await calculateMatchPoints(match.id);

          summary.completed++;
          summary.pointsCalculated++;

        } else if (normalized.status === "LIVE") {
          const hasValidScores = apiScoreA !== null && apiScoreB !== null;

          // Performance Optimization: Skip writing to DB if match is already marked LIVE with identical scores
          if (match.status === MatchStatus.LIVE && match.teamAScore === apiScoreA && match.teamBScore === apiScoreB) {
            summary.skippedUpcoming++;
            continue;
          }

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
              ...normFields,
            },
          });
          summary.updatedLive++;

        } else {
          // UPCOMING / Not started match
          if (match.status === MatchStatus.POSTPONED || match.status === MatchStatus.CANCELLED) {
            summary.skippedUpcoming++;
            continue;
          }

          if (match.scoreSource === "ADMIN") {
            summary.skippedUpcoming++;
            continue;
          }

          // Performance Optimization: Skip writing to DB if match is already mapped with matching kickoff Time
          const normalizedTime = normalized.kickoffUtc ? normalized.kickoffUtc.getTime() : null;
          const dbTime = new Date(match.matchTime).getTime();
          if (match.apiMatchId === normalized.apiMatchId && dbTime === normalizedTime) {
            summary.skippedUpcoming++;
            continue;
          }

          const updateData: any = {
            apiProvider: "worldcup26.ir",
            apiMatchId: normalized.apiMatchId,
            lastSyncedAt: new Date(),
            ...apiUrls,
            ...normFields,
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

    return { success: true, summary };

  } catch (error: any) {
    console.error("API sync fatal error:", error);
    return { success: false, error: `Failed to execute sync: ${error.message || error}` };
  }
}
