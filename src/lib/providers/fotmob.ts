import { NormalizedFixture } from "./index";

export function findMatchesArray(obj: any): any[] | null {
  if (!obj || typeof obj !== "object") return null;

  // 1. Direct array check
  if (Array.isArray(obj)) return obj;

  // 2. Direct key checks
  if (obj.matches && Array.isArray(obj.matches)) return obj.matches;
  if (obj.fixtures && Array.isArray(obj.fixtures)) return obj.fixtures;

  // 3. raw.data.matches and raw.data.fixtures
  if (obj.data && typeof obj.data === "object") {
    if (obj.data.matches && Array.isArray(obj.data.matches)) return obj.data.matches;
    if (obj.data.fixtures && Array.isArray(obj.data.fixtures)) return obj.data.fixtures;
  }

  // 4. raw.matches.allMatches
  if (obj.matches && obj.matches.allMatches && Array.isArray(obj.matches.allMatches)) {
    return obj.matches.allMatches;
  }

  // 5. raw.rounds[].matches
  if (obj.rounds && Array.isArray(obj.rounds)) {
    const list: any[] = [];
    for (const round of obj.rounds) {
      if (round && round.matches && Array.isArray(round.matches)) {
        list.push(...round.matches);
      }
    }
    if (list.length > 0) return list;
  }

  // 6. raw.leagues[].matches
  if (obj.leagues && Array.isArray(obj.leagues)) {
    const list: any[] = [];
    for (const league of obj.leagues) {
      if (league && league.matches && Array.isArray(league.matches)) {
        list.push(...league.matches);
      }
    }
    if (list.length > 0) return list;
  }

  // 7. General search for any array key containing match objects
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      const first = val[0];
      if (first.id || first.home || first.away || first.homeName || first.teamA) {
        return val;
      }
    }
  }

  // 8. If nested in matches object
  if (obj.matches && typeof obj.matches === "object") {
    for (const key of Object.keys(obj.matches)) {
      const val = obj.matches[key];
      if (Array.isArray(val)) return val;
    }
  }

  return null;
}

export function normalizeFotMobMatch(item: any): NormalizedFixture | null {
  if (!item || typeof item !== "object") return null;

  const id = item.id || item.matchId || item.providerMatchId;
  if (!id) return null;

  // Parse Home team name
  let teamA: string | null = null;
  if (item.home && typeof item.home === "object") {
    teamA = item.home.name || null;
  } else if (typeof item.home === "string") {
    teamA = item.home;
  } else if (item.homeName) {
    teamA = item.homeName;
  } else if (item.teamA) {
    teamA = item.teamA;
  }

  // Parse Away team name
  let teamB: string | null = null;
  if (item.away && typeof item.away === "object") {
    teamB = item.away.name || null;
  } else if (typeof item.away === "string") {
    teamB = item.away;
  } else if (item.awayName) {
    teamB = item.awayName;
  } else if (item.teamB) {
    teamB = item.teamB;
  }

  // Parse kickoff time
  const timeRaw = item.time || item.date || item.kickoffTime || item.utcTime || (item.status && item.status.utcTime);
  if (!timeRaw) return null;
  const kickoffTime = new Date(timeRaw);
  if (isNaN(kickoffTime.getTime())) return null;

  // Parse stage/round string to match Stage Enum
  const roundStr = item.roundName || item.round || item.stage || "";
  let stage = "GROUP";
  const rLower = String(roundStr).toLowerCase();
  if (rLower.includes("32") || rLower.includes("thirty-two") || rLower.includes("thirty two")) stage = "ROUND_OF_32";
  else if (rLower.includes("16") || rLower.includes("sixteen")) stage = "ROUND_OF_16";
  else if (rLower.includes("quarter") || rLower.includes("8")) stage = "QUARTER_FINAL";
  else if (rLower.includes("semi") || rLower.includes("4")) stage = "SEMI_FINAL";
  else if (rLower.includes("third") || rLower.includes("3rd") || rLower.includes("bronze")) stage = "THIRD_PLACE";
  else if (rLower.includes("final")) stage = "FINAL";

  // Parse match status
  let status = "UPCOMING";
  const finished = 
    item.finished === true || 
    (item.status && (item.status.finished === true || item.status.reason?.short === "FT" || item.status.reason?.long === "Full Time"));
  const live = 
    item.live === true || 
    (item.status && (item.status.live === true || item.status.reason?.short === "HT" || item.status.reason?.short === "Min"));

  if (finished) status = "COMPLETED";
  else if (live) status = "LIVE";

  // Parse scores
  let teamAScore: number | null = null;
  let teamBScore: number | null = null;

  if (item.homeScore !== undefined && item.homeScore !== null) {
    teamAScore = Number(item.homeScore);
  } else if (item.home && item.home.score !== undefined && item.home.score !== null) {
    teamAScore = Number(item.home.score);
  }

  if (item.awayScore !== undefined && item.awayScore !== null) {
    teamBScore = Number(item.awayScore);
  } else if (item.away && item.away.score !== undefined && item.away.score !== null) {
    teamBScore = Number(item.away.score);
  }

  // Fallback: Parse score string (e.g. "2 - 1")
  if (teamAScore === null && teamBScore === null && item.status?.scoreStr) {
    const parts = String(item.status.scoreStr).split("-");
    if (parts.length === 2) {
      const a = parseInt(parts[0].trim());
      const b = parseInt(parts[1].trim());
      if (!isNaN(a) && !isNaN(b)) {
        teamAScore = a;
        teamBScore = b;
      }
    }
  }

  // Parse penalty shootout info if decided by penalties
  let decidedBy: "NORMAL_TIME" | "EXTRA_TIME" | "PENALTIES" | "CANCELLED" | "VOID" = "NORMAL_TIME";
  let winnerTeam: string | null = null;
  let penaltyTeamAScore: number | null = null;
  let penaltyTeamBScore: number | null = null;

  const hasPenalties = 
    item.penaltyScoreA !== undefined || 
    item.home?.penaltyScore !== undefined || 
    item.penaltyWinner !== undefined ||
    (item.status && (item.status.penalties === true || item.status.reason?.short === "AP" || item.status.reason?.long?.toLowerCase().includes("penalties")));

  if (hasPenalties) {
    decidedBy = "PENALTIES";
    if (item.penaltyScoreA !== undefined && item.penaltyScoreA !== null) {
      penaltyTeamAScore = Number(item.penaltyScoreA);
    } else if (item.home && item.home.penaltyScore !== undefined && item.home.penaltyScore !== null) {
      penaltyTeamAScore = Number(item.home.penaltyScore);
    }

    if (item.penaltyScoreB !== undefined && item.penaltyScoreB !== null) {
      penaltyTeamBScore = Number(item.penaltyScoreB);
    } else if (item.away && item.away.penaltyScore !== undefined && item.away.penaltyScore !== null) {
      penaltyTeamBScore = Number(item.away.penaltyScore);
    }

    if (penaltyTeamAScore !== null && penaltyTeamBScore !== null) {
      if (penaltyTeamAScore > penaltyTeamBScore) {
        winnerTeam = teamA;
      } else if (penaltyTeamAScore < penaltyTeamBScore) {
        winnerTeam = teamB;
      }
    }

    if (!winnerTeam && item.penaltyWinner) {
      winnerTeam = item.penaltyWinner === "home" ? teamA : item.penaltyWinner === "away" ? teamB : String(item.penaltyWinner);
    }
  }

  return {
    provider: "fotmob",
    providerMatchId: String(id),
    stage,
    round: roundStr,
    teamA,
    teamB,
    kickoffTime,
    venue: item.venue?.name || item.venue || null,
    status,
    teamAScore,
    teamBScore,
    decidedBy,
    winnerTeam,
    penaltyTeamAScore,
    penaltyTeamBScore,
    raw: item,
  };
}

export async function fetchFotMobFixtures(): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  // If FotMob provider configured checking is required, fail gracefully if keys/urls not set.
  // Environment variables: FOTMOB_BASE_URL (proxy), FOTMOB_API_KEY
  const isEnabled = process.env.FOOTBALL_PROVIDER === "fotmob" || process.env.FOTMOB_ENABLED === "true";
  
  // Preferred default values
  const baseUrl = process.env.FOTMOB_BASE_URL || "https://www.fotmob.com";
  const leagueId = process.env.FOTMOB_LEAGUE_ID || process.env.FOTMOB_TOURNAMENT_ID || "77"; // World Cup default

  // Fail gracefully if selected provider is fotmob but configuration is incomplete
  if (process.env.FOOTBALL_PROVIDER === "fotmob" && !baseUrl) {
    return { success: false, error: "FotMob provider is not configured.", fixtures: [] };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const targetUrl = `${baseUrl.replace(/\/$/, "")}/api/league?id=${leagueId}`;
    console.log(`[FOTMOB] Fetching league fixtures from: ${targetUrl}`);

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    };

    if (process.env.FOTMOB_API_KEY) {
      headers["x-apisports-key"] = process.env.FOTMOB_API_KEY; // API key if proxy requires it
    }

    const res = await fetch(targetUrl, {
      cache: "no-store",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `FotMob returned error status: ${res.status}`, fixtures: [] };
    }

    const data = await res.json();
    const rawMatches = findMatchesArray(data);
    if (!rawMatches || !Array.isArray(rawMatches)) {
      return { success: false, error: "No matches found in FotMob API response structure.", fixtures: [] };
    }

    const fixtures: NormalizedFixture[] = [];
    for (const item of rawMatches) {
      const normalized = normalizeFotMobMatch(item);
      if (normalized) {
        fixtures.push(normalized);
      }
    }

    return { success: true, fixtures };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch FotMob: ${err.message || err}`, fixtures: [] };
  }
}
