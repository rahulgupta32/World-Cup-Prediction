import { NormalizedFixture } from "./index";
import { getStageFromApiType, toNormalizedApiMatch } from "../match-sync";
import { MatchStage } from "@prisma/client";

export async function fetchWorldCupFixtures(): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch("https://worldcup26.ir/get/games", {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `API status error: ${res.status}`, fixtures: [] };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.games)) {
      return { success: false, error: "Invalid API response format.", fixtures: [] };
    }

    const fixtures: NormalizedFixture[] = data.games.map((g: any) => {
      const stage = getStageFromApiType(g.type) || MatchStage.GROUP;
      const normalized = toNormalizedApiMatch(g);

      return {
        provider: "worldcup",
        providerMatchId: normalized.apiMatchId || String(g.id),
        stage,
        round: g.type || null,
        teamA: normalized.teamA,
        teamB: normalized.teamB,
        kickoffTime: normalized.kickoffUtc,
        venue: g.stadium_id ? String(g.stadium_id) : null,
        status: normalized.status,
        teamAScore: normalized.scoreA,
        teamBScore: normalized.scoreB,
        raw: g,
      };
    });

    return { success: true, fixtures };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch worldcup: ${err.message || err}`, fixtures: [] };
  }
}
