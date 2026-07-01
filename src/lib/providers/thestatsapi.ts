import { NormalizedFixture } from "./index";

export async function fetchTheStatsApiFixtures(): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  const key = process.env.THE_STATS_API_KEY;
  if (!key) {
    return { success: false, error: "API key is not configured.", fixtures: [] };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://api.thestatsapi.com/v1/fixtures?tournament=world_cup&season=2026&api_key=${key}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `TheStatsAPI returned error status: ${res.status}`, fixtures: [] };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.data)) {
      return { success: false, error: "Invalid API response format.", fixtures: [] };
    }

    const fixtures: NormalizedFixture[] = data.data.map((item: any) => {
      return {
        provider: "thestatsapi",
        providerMatchId: String(item.id),
        stage: item.stage || "GROUP",
        round: item.round || null,
        teamA: item.team_a?.name || null,
        teamB: item.team_b?.name || null,
        kickoffTime: new Date(item.kickoff_time),
        venue: item.venue || null,
        status: item.status || "UPCOMING",
        teamAScore: item.team_a_score !== undefined ? item.team_a_score : null,
        teamBScore: item.team_b_score !== undefined ? item.team_b_score : null,
        raw: item,
      };
    });

    return { success: true, fixtures };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch TheStatsAPI: ${err.message || err}`, fixtures: [] };
  }
}
