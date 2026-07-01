import { NormalizedFixture } from "./index";

export async function fetchApiFootballFixtures(): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  const key = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY;
  if (!key) {
    return { success: false, error: "API key is not configured.", fixtures: [] };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
      cache: "no-store",
      headers: {
        "x-apisports-key": key,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `API-Football returned error status: ${res.status}`, fixtures: [] };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.response)) {
      return { success: false, error: "Invalid API response format.", fixtures: [] };
    }

    const fixtures: NormalizedFixture[] = data.response.map((item: any) => {
      const f = item.fixture;
      const t = item.teams;
      const roundStr = item.league?.round || "";
      
      // Map round to MatchStage
      let stage = "GROUP";
      if (roundStr.toLowerCase().includes("round of 32")) stage = "ROUND_OF_32";
      else if (roundStr.toLowerCase().includes("round of 16")) stage = "ROUND_OF_16";
      else if (roundStr.toLowerCase().includes("quarter-final")) stage = "QUARTER_FINAL";
      else if (roundStr.toLowerCase().includes("semi-final")) stage = "SEMI_FINAL";
      else if (roundStr.toLowerCase().includes("third")) stage = "THIRD_PLACE";
      else if (roundStr.toLowerCase().includes("final")) stage = "FINAL";

      return {
        provider: "apifootball",
        providerMatchId: String(f.id),
        stage,
        round: roundStr,
        teamA: t.home?.name || null,
        teamB: t.away?.name || null,
        kickoffTime: new Date(f.date),
        venue: f.venue?.name || null,
        status: f.status?.short === "FT" ? "COMPLETED" : f.status?.short === "NS" ? "UPCOMING" : "LIVE",
        teamAScore: item.goals?.home !== undefined ? item.goals.home : null,
        teamBScore: item.goals?.away !== undefined ? item.goals.away : null,
        raw: item,
      };
    });

    return { success: true, fixtures };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch API-Football: ${err.message || err}`, fixtures: [] };
  }
}
