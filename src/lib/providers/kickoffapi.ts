import { NormalizedFixture } from "./index";

export async function fetchKickoffApiFixtures(): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  const key = process.env.KICKOFF_API_KEY;
  if (!key) {
    return { success: false, error: "API key is not configured.", fixtures: [] };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://api.kickoffapi.com/v1/fixtures?api_key=${key}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `KickoffAPI returned error status: ${res.status}`, fixtures: [] };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.fixtures)) {
      return { success: false, error: "Invalid API response format.", fixtures: [] };
    }

    const fixtures: NormalizedFixture[] = data.fixtures.map((item: any) => {
      return {
        provider: "kickoffapi",
        providerMatchId: String(item.id),
        stage: item.stage || "GROUP",
        round: item.round || null,
        teamA: item.home_team || null,
        teamB: item.away_team || null,
        kickoffTime: new Date(item.kickoff_utc),
        venue: item.stadium || null,
        status: item.status || "UPCOMING",
        teamAScore: item.home_score !== undefined ? item.home_score : null,
        teamBScore: item.away_score !== undefined ? item.away_score : null,
        raw: item,
      };
    });

    return { success: true, fixtures };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch KickoffAPI: ${err.message || err}`, fixtures: [] };
  }
}
