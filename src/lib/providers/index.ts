export type NormalizedFixture = {
  provider: string;
  providerMatchId: string;
  competitionId?: string;
  seasonId?: string;
  matchNumber?: string;
  stage?: string;
  round?: string;
  teamA: string | null;
  teamB: string | null;
  kickoffTime: Date | string;
  venue?: string | null;
  status?: string;
  teamAScore?: number | null;
  teamBScore?: number | null;
  decidedBy?: "NORMAL_TIME" | "EXTRA_TIME" | "PENALTIES" | "CANCELLED" | "VOID";
  winnerTeam?: string | null;
  raw?: unknown;
};

import { fetchWorldCupFixtures } from "./worldcup";
import { fetchApiFootballFixtures } from "./apifootball";
import { fetchTheStatsApiFixtures } from "./thestatsapi";
import { fetchKickoffApiFixtures } from "./kickoffapi";

export async function fetchFixtures(provider: string): Promise<{ success: boolean; error?: string; fixtures: NormalizedFixture[] }> {
  switch (provider) {
    case "worldcup":
      return fetchWorldCupFixtures();
    case "apifootball":
      return fetchApiFootballFixtures();
    case "thestatsapi":
      return fetchTheStatsApiFixtures();
    case "kickoffapi":
      return fetchKickoffApiFixtures();
    default:
      return { success: false, error: "Invalid provider selected.", fixtures: [] };
  }
}
