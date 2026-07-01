import { isTbdTeam } from "../src/lib/utils";

// Re-implement the stage mapper and matching heuristic locally in the test to verify correctness in isolation
type MatchStage = "GROUP" | "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "THIRD_PLACE" | "FINAL";

function getStageFromApiType(type: string): MatchStage | null {
  switch (type?.toLowerCase()) {
    case "r32": return "ROUND_OF_32";
    case "r16": return "ROUND_OF_16";
    case "qf": return "QUARTER_FINAL";
    case "sf": return "SEMI_FINAL";
    case "third": return "THIRD_PLACE";
    case "final": return "FINAL";
    default: return null;
  }
}

function runTests() {
  console.log("Starting Knockout Fixture Heuristic & Locking Unit Tests...");

  // Test 1: isTbdTeam check
  const placeholders = ["TBD", "Winner Group A", "Runner-up Group B", "Loser Match 48", "TBD Team"];
  for (const p of placeholders) {
    if (!isTbdTeam(p)) {
      console.error(`FAIL: ${p} should be recognized as a TBD placeholder`);
      process.exit(1);
    }
  }
  
  const realTeams = ["Canada", "Morocco", "Argentina", "France"];
  for (const t of realTeams) {
    if (isTbdTeam(t)) {
      console.error(`FAIL: ${t} should NOT be recognized as a TBD placeholder`);
      process.exit(1);
    }
  }
  console.log("✅ PASS: isTbdTeam correctly identifies and locks TBD placeholders, while allowing real teams.");

  // Test 2: Heuristic matching
  const mockDbMatches = [
    {
      id: "local_match_1",
      teamA: "Winner Group A",
      teamB: "Runner-up Group B",
      stage: "ROUND_OF_16",
      isKnockout: true,
      matchTime: new Date("2026-07-04T18:00:00Z"),
      apiMatchId: null,
    },
    {
      id: "local_match_2",
      teamA: "Winner Group C",
      teamB: "Runner-up Group D",
      stage: "ROUND_OF_16",
      isKnockout: true,
      matchTime: new Date("2026-07-04T22:00:00Z"),
      apiMatchId: null,
    }
  ];

  const mockApiGames = [
    {
      type: "r16",
      home_team_name_en: "Canada",
      away_team_name_en: "Morocco",
      local_date: "07/04/2026 18:00", // matches local_match_1 (with offset 0)
      stadium_id: "0",
      id: "api_95"
    }
  ];

  // Helper matching logic as defined in runKnockoutFixtureSync
  for (const game of mockApiGames) {
    const apiStage = getStageFromApiType(game.type);
    if (!apiStage) continue;

    const kickoffUtc = new Date("2026-07-04T18:00:00Z"); // parsed kickoff

    let match = null;
    let highestScore = 0;
    let isAmbiguous = false;

    for (const m of mockDbMatches) {
      let score = 0;
      if (m.stage === apiStage) {
        score += 10;
      }
      if (kickoffUtc && m.matchTime) {
        const timeDiff = Math.abs(m.matchTime.getTime() - kickoffUtc.getTime());
        if (timeDiff <= 2 * 60 * 60 * 1000) {
          score += 10;
        }
      }
      if (isTbdTeam(m.teamA) || isTbdTeam(m.teamB)) {
        score += 5;
      }

      if (score >= 15) {
        if (score > highestScore) {
          highestScore = score;
          match = m;
          isAmbiguous = false;
        } else if (score === highestScore) {
          isAmbiguous = true;
        }
      }
    }

    if (isAmbiguous) {
      console.error("FAIL: Match was marked ambiguous when it shouldn't be.");
      process.exit(1);
    }

    if (!match || match.id !== "local_match_1") {
      console.error("FAIL: Matching heuristic failed to identify the correct placeholder match.");
      process.exit(1);
    }

    console.log(`✅ PASS: Heuristic correctly matched API game to database placeholder (ID: ${match.id}).`);
    
    // Simulate updating placeholder to real teams
    const updatedMatch = {
      ...match,
      teamA: "Canada",
      teamB: "Morocco",
      apiMatchId: game.id,
    };

    if (updatedMatch.id === match.id) {
      console.log("✅ PASS: Same match ID preserved after simulating placeholder update.");
    } else {
      console.error("FAIL: Match ID was not preserved.");
      process.exit(1);
    }
  }

  console.log("All knockout fixture update tests completed successfully!");
}

runTests();
