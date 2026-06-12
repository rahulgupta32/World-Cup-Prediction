import "dotenv/config";
import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { Outcome, PredictionResult, MatchStatus } from "@prisma/client";

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

function getResultFromScore(scoreA: number, scoreB: number): Outcome {
  if (scoreA > scoreB) return Outcome.TEAM_A;
  if (scoreA < scoreB) return Outcome.TEAM_B;
  return Outcome.DRAW;
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

const STADIUM_NAMES: Record<string, string> = {
  "1": "Estadio Azteca, Mexico City",
  "2": "Estadio Akron, Guadalajara",
  "3": "Estadio BBVA, Monterrey",
  "4": "AT&T Stadium, Dallas",
  "5": "NRG Stadium, Houston",
  "6": "GEHA Field at Arrowhead Stadium, Kansas City",
  "7": "Mercedes-Benz Stadium, Atlanta",
  "8": "Hard Rock Stadium, Miami",
  "9": "Gillette Stadium, Boston",
  "10": "Lincoln Financial Field, Philadelphia",
  "11": "MetLife Stadium, New York/New Jersey",
  "12": "BMO Field, Toronto",
  "13": "BC Place, Vancouver",
  "14": "Lumen Field, Seattle",
  "15": "Levi's Stadium, San Francisco",
  "16": "SoFi Stadium, Los Angeles",
};

const officialFallbackMatches = [
  { teamA: "Mexico", teamB: "South Africa", matchTime: new Date("2026-06-11T19:00:00Z"), group: "Group A", venue: "Mexico City Stadium (Estadio Azteca)" },
  { teamA: "Korea Republic", teamB: "Czechia", matchTime: new Date("2026-06-12T02:00:00Z"), group: "Group A", venue: "Guadalajara Stadium" },
  { teamA: "Canada", teamB: "Bosnia and Herzegovina", matchTime: new Date("2026-06-12T19:00:00Z"), group: "Group B", venue: "Toronto Stadium" },
  { teamA: "USA", teamB: "Paraguay", matchTime: new Date("2026-06-13T01:00:00Z"), group: "Group D", venue: "Los Angeles Stadium (SoFi Stadium)" },
  { teamA: "Qatar", teamB: "Switzerland", matchTime: new Date("2026-06-13T19:00:00Z"), group: "Group B", venue: "San Francisco Bay Stadium" },
  { teamA: "Brazil", teamB: "Morocco", matchTime: new Date("2026-06-13T22:00:00Z"), group: "Group C", venue: "New York New Jersey Stadium" },
  { teamA: "Haiti", teamB: "Scotland", matchTime: new Date("2026-06-14T01:00:00Z"), group: "Group C", venue: "Boston Stadium" },
  { teamA: "Australia", teamB: "Türkiye", matchTime: new Date("2026-06-14T04:00:00Z"), group: "Group D", venue: "BC Place Vancouver" },
  { teamA: "Germany", teamB: "Curaçao", matchTime: new Date("2026-06-14T16:00:00Z"), group: "Group E", venue: "Houston Stadium" },
  { teamA: "Ivory Coast", teamB: "Ecuador", matchTime: new Date("2026-06-14T19:00:00Z"), group: "Group E", venue: "Atlanta Stadium" },
  { teamA: "Netherlands", teamB: "Japan", matchTime: new Date("2026-06-14T19:00:00Z"), group: "Group F", venue: "Dallas Stadium" },
  { teamA: "Sweden", teamB: "Tunisia", matchTime: new Date("2026-06-14T22:00:00Z"), group: "Group F", venue: "Miami Stadium" },
  { teamA: "Belgium", teamB: "Egypt", matchTime: new Date("2026-06-15T16:00:00Z"), group: "Group G", venue: "Seattle Stadium" },
  { teamA: "Iran", teamB: "New Zealand", matchTime: new Date("2026-06-15T19:00:00Z"), group: "Group G", venue: "Kansas City Stadium" },
  { teamA: "Spain", teamB: "Cape Verde", matchTime: new Date("2026-06-15T22:00:00Z"), group: "Group H", venue: "Dallas Stadium" },
  { teamA: "Saudi Arabia", teamB: "Uruguay", matchTime: new Date("2026-06-16T01:00:00Z"), group: "Group H", venue: "Los Angeles Stadium" },
  { teamA: "France", teamB: "Senegal", matchTime: new Date("2026-06-16T16:00:00Z"), group: "Group I", venue: "New York New Jersey Stadium" },
  { teamA: "Iraq", teamB: "Norway", matchTime: new Date("2026-06-16T19:00:00Z"), group: "Group I", venue: "Boston Stadium" },
  { teamA: "Argentina", teamB: "Algeria", matchTime: new Date("2026-06-16T22:00:00Z"), group: "Group J", venue: "Cincinnati Stadium" },
  { teamA: "Austria", teamB: "Jordan", matchTime: new Date("2026-06-17T01:00:00Z"), group: "Group J", venue: "Philadelphia Stadium" },
  { teamA: "Portugal", teamB: "DR Congo", matchTime: new Date("2026-06-17T16:00:00Z"), group: "Group K", venue: "Houston Stadium" },
  { teamA: "Uzbekistan", teamB: "Colombia", matchTime: new Date("2026-06-17T19:00:00Z"), group: "Group K", venue: "San Francisco Bay Stadium" },
  { teamA: "England", teamB: "Croatia", matchTime: new Date("2026-06-17T19:00:00Z"), group: "Group L", venue: "Dallas Stadium" },
  { teamA: "Ghana", teamB: "Panama", matchTime: new Date("2026-06-17T22:00:00Z"), group: "Group L", venue: "Atlanta Stadium" },
];

async function main() {
  console.log("Seeding database...");

  const isProd = process.env.NODE_ENV === "production";
  const seedDemo = process.env.SEED_DEMO_DATA === "true";

  if (isProd && seedDemo) {
    throw new Error("Demo data cannot be seeded in production.");
  }

  // Validate admin credentials
  let adminEmail = process.env.ADMIN_EMAIL;
  let adminPassword = process.env.ADMIN_PASSWORD;

  if (isProd) {
    if (!adminEmail || !adminPassword) {
      throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment variables in production mode.");
    }
  } else {
    adminEmail = adminEmail || "admin@league.com";
    adminPassword = adminPassword || "admin123";
  }

  // 1. Always seed Admin User using upsert
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Admin User",
      passwordHash: adminHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
    create: {
      name: "Admin User",
      email: adminEmail,
      passwordHash: adminHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin user seeded: ${admin.email}`);

  // Fetch all existing matches in the DB to perform local duplicate matching
  const dbMatches = await prisma.match.findMany();

  // 2. Seed Official Matches (preferring API for all 104 matches, fallback to 24 hardcoded if API fails)
  let seededMatches: any[] = [];
  try {
    console.log("Fetching all 104 matches from the World Cup API...");
    const res = await fetch("https://worldcup26.ir/get/games");
    if (!res.ok) throw new Error(`API returned status ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.games)) throw new Error("Invalid API format");

    console.log(`Successfully fetched ${data.games.length} matches from API. Seeding them...`);

    for (const game of data.games) {
      const matchTime = parseLocalDate(game.local_date, String(game.stadium_id)) || new Date();
      
      const finishedStr = String(game.finished).toUpperCase();
      const timeElapsedStr = String(game.time_elapsed).toLowerCase();
      let status: MatchStatus = MatchStatus.UPCOMING;
      if (finishedStr === "TRUE" || timeElapsedStr === "finished") {
        status = MatchStatus.COMPLETED;
      } else if (timeElapsedStr === "live" || (timeElapsedStr !== "notstarted" && timeElapsedStr !== "")) {
        status = MatchStatus.LIVE;
      }
      if (timeElapsedStr === "cancelled" || timeElapsedStr === "void") {
        status = MatchStatus.CANCELLED;
      } else if (timeElapsedStr === "postponed" || timeElapsedStr === "delayed") {
        status = MatchStatus.POSTPONED;
      }

      const scoreAStr = game.home_score;
      const scoreBStr = game.away_score;
      const scoreA = (scoreAStr !== undefined && scoreAStr !== null && scoreAStr !== "null" && scoreAStr !== "") ? parseInt(scoreAStr) : null;
      const scoreB = (scoreBStr !== undefined && scoreBStr !== null && scoreBStr !== "null" && scoreBStr !== "") ? parseInt(scoreBStr) : null;
      const outcome = (scoreA !== null && scoreB !== null) ? getResultFromScore(scoreA, scoreB) : null;

      const rawA = game.home_team_name_en || "TBD";
      const rawB = game.away_team_name_en || "TBD";
      const canonicalA = getCanonicalTeamName(rawA);
      const canonicalB = getCanonicalTeamName(rawB);
      const teams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
      const matchDateKey = matchTime.toISOString().split("T")[0];

      // Find if exists
      let existingMatch = dbMatches.find(
        m => m.apiProvider === "worldcup26.ir" && m.apiMatchId === String(game.id)
      );

      if (!existingMatch) {
        existingMatch = dbMatches.find(m => {
          if (m.normalizedTeamA && m.normalizedTeamB && m.matchDateKey) {
            return m.normalizedTeamA === teams[0] && m.normalizedTeamB === teams[1] && m.matchDateKey === matchDateKey;
          }
          const dbA = normalizeTeamName(m.teamA);
          const dbB = normalizeTeamName(m.teamB);
          const nameOk = (teams[0] === dbA && teams[1] === dbB) || (teams[0] === dbB && teams[1] === dbA);
          if (!nameOk) return false;
          const diff = Math.abs(new Date(m.matchTime).getTime() - matchTime.getTime());
          return diff < 24 * 60 * 60 * 1000;
        });
      }

      const matchData = {
        teamA: canonicalA,
        teamB: canonicalB,
        matchTime,
        predictionDeadline: matchTime,
        status,
        teamAScore: scoreA,
        teamBScore: scoreB,
        result: outcome,
        group: game.group ? `Group ${game.group}` : "Group Stage",
        venue: STADIUM_NAMES[String(game.stadium_id)] || `Stadium #${game.stadium_id}`,
        source: "worldcup26.ir",
        sourceUpdatedAt: new Date(),
        apiProvider: "worldcup26.ir",
        apiMatchId: String(game.id),
        normalizedTeamA: teams[0],
        normalizedTeamB: teams[1],
        matchDateKey,
      };

      let createdMatch;
      if (existingMatch) {
        createdMatch = await prisma.match.update({
          where: { id: existingMatch.id },
          data: matchData,
        });
      } else {
        createdMatch = await prisma.match.create({
          data: matchData,
        });
      }
      seededMatches.push(createdMatch);
    }
    console.log(`Successfully seeded ${seededMatches.length} official matches from the API.`);
  } catch (error: any) {
    console.warn(`Failed to seed matches from API: ${error.message}. Falling back to 24 hardcoded matches...`);
    seededMatches = [];
    for (const m of officialFallbackMatches) {
      const canonicalA = getCanonicalTeamName(m.teamA);
      const canonicalB = getCanonicalTeamName(m.teamB);
      const teams = [normalizeTeamName(canonicalA), normalizeTeamName(canonicalB)].sort();
      const matchDateKey = m.matchTime.toISOString().split("T")[0];

      const matchData = {
        teamA: canonicalA,
        teamB: canonicalB,
        matchTime: m.matchTime,
        predictionDeadline: m.matchTime,
        status: MatchStatus.UPCOMING,
        group: m.group,
        venue: m.venue,
        source: "Official FIFA Schedule (Fallback)",
        sourceUpdatedAt: new Date(),
        apiProvider: "fallback",
        apiMatchId: `${m.teamA}-${m.teamB}`,
        normalizedTeamA: teams[0],
        normalizedTeamB: teams[1],
        matchDateKey,
      };

      const existingMatch = dbMatches.find(x => {
        if (x.normalizedTeamA && x.normalizedTeamB && x.matchDateKey) {
          return x.normalizedTeamA === teams[0] && x.normalizedTeamB === teams[1] && x.matchDateKey === matchDateKey;
        }
        return false;
      });

      let createdMatch;
      if (existingMatch) {
        createdMatch = await prisma.match.update({
          where: { id: existingMatch.id },
          data: matchData,
        });
      } else {
        createdMatch = await prisma.match.create({
          data: matchData,
        });
      }
      seededMatches.push(createdMatch);
    }
    console.log(`Successfully seeded ${seededMatches.length} fallback official matches.`);
  }

  // 3. Conditional Demo Seeding (Only in development/test, and when SEED_DEMO_DATA=true)
  if (seedDemo) {
    console.log("Seeding demo data...");
    const demoPasswordHash = await bcrypt.hash("password123", 10);

    const demoUsersData = [
      { name: "Alice Smith", email: "alice@league.com" },
      { name: "Bob Jones", email: "bob@league.com" },
      { name: "Charlie Brown", email: "charlie@league.com" },
      { name: "David Miller", email: "david@league.com" },
      { name: "Emma Wilson", email: "emma@league.com" },
    ];

    const seededDemoUsers = [];
    for (const du of demoUsersData) {
      const u = await prisma.user.upsert({
        where: { email: du.email },
        update: {
          name: du.name,
          passwordHash: demoPasswordHash,
          role: "USER",
        },
        create: {
          name: du.name,
          email: du.email,
          passwordHash: demoPasswordHash,
          role: "USER",
        },
      });
      seededDemoUsers.push(u);
    }
    console.log("Demo users created/updated.");

    const alice = seededDemoUsers.find(u => u.email === "alice@league.com")!;
    const bob = seededDemoUsers.find(u => u.email === "bob@league.com")!;
    const charlie = seededDemoUsers.find(u => u.email === "charlie@league.com")!;
    const david = seededDemoUsers.find(u => u.email === "david@league.com")!;
    const emma = seededDemoUsers.find(u => u.email === "emma@league.com")!;

    // Seed one completed warm-up match (USA vs Canada)
    const warmupMatch = await prisma.match.upsert({
      where: {
        apiProvider_apiMatchId: {
          apiProvider: "demo",
          apiMatchId: "warmup",
        },
      },
      update: {
        teamAScore: 2,
        teamBScore: 1,
        result: Outcome.TEAM_A,
      },
      create: {
        teamA: "USA",
        teamB: "Canada",
        matchTime: new Date("2026-06-10T20:00:00Z"),
        predictionDeadline: new Date("2026-06-10T20:00:00Z"),
        status: MatchStatus.COMPLETED,
        teamAScore: 2,
        teamBScore: 1,
        result: Outcome.TEAM_A,
        group: "Warm-up",
        venue: "Boston Stadium",
        source: "Warm-up match",
        sourceUpdatedAt: new Date(),
        apiProvider: "demo",
        apiMatchId: "warmup",
      },
    });

    // Seed mock predictions for the warm-up match
    const demoPredictions = [
      { userId: alice.id, matchId: warmupMatch.id, predictedResult: Outcome.TEAM_A, predictedTeamAScore: 2, predictedTeamBScore: 1, pointsAwarded: 5, predictionResult: PredictionResult.EXACT_SCORE },
      { userId: bob.id, matchId: warmupMatch.id, predictedResult: Outcome.TEAM_A, predictedTeamAScore: 1, predictedTeamBScore: 0, pointsAwarded: 2, predictionResult: PredictionResult.CORRECT_OUTCOME },
      { userId: charlie.id, matchId: warmupMatch.id, predictedResult: Outcome.DRAW, predictedTeamAScore: 1, predictedTeamBScore: 1, pointsAwarded: -1, predictionResult: PredictionResult.WRONG },
      { userId: david.id, matchId: warmupMatch.id, predictedResult: Outcome.TEAM_B, predictedTeamAScore: 0, predictedTeamBScore: 2, pointsAwarded: -1, predictionResult: PredictionResult.WRONG },
      { userId: emma.id, matchId: warmupMatch.id, predictedResult: Outcome.TEAM_A, predictedTeamAScore: 2, predictedTeamBScore: 1, pointsAwarded: 5, predictionResult: PredictionResult.EXACT_SCORE },
    ];

    for (const dp of demoPredictions) {
      await prisma.prediction.upsert({
        where: {
          userId_matchId: {
            userId: dp.userId,
            matchId: dp.matchId,
          },
        },
        update: {
          predictedResult: dp.predictedResult,
          predictedTeamAScore: dp.predictedTeamAScore,
          predictedTeamBScore: dp.predictedTeamBScore,
          pointsAwarded: dp.pointsAwarded,
          predictionResult: dp.predictionResult,
          isCalculated: true,
        },
        create: {
          userId: dp.userId,
          matchId: dp.matchId,
          predictedResult: dp.predictedResult,
          predictedTeamAScore: dp.predictedTeamAScore,
          predictedTeamBScore: dp.predictedTeamBScore,
          pointsAwarded: dp.pointsAwarded,
          predictionResult: dp.predictionResult,
          isCalculated: true,
        },
      });
    }

    // Seed upcoming predictions for the first match to show some data in UI
    const mexicoMatch = seededMatches.find(m => m.teamA === "Mexico" && m.teamB === "South Africa");
    if (mexicoMatch) {
      await prisma.prediction.upsert({
        where: { userId_matchId: { userId: alice.id, matchId: mexicoMatch.id } },
        update: {},
        create: {
          userId: alice.id,
          matchId: mexicoMatch.id,
          predictedResult: Outcome.TEAM_A,
          predictedTeamAScore: 2,
          predictedTeamBScore: 1,
        },
      });
      await prisma.prediction.upsert({
        where: { userId_matchId: { userId: bob.id, matchId: mexicoMatch.id } },
        update: {},
        create: {
          userId: bob.id,
          matchId: mexicoMatch.id,
          predictedResult: Outcome.DRAW,
          predictedTeamAScore: 1,
          predictedTeamBScore: 1,
        },
      });
    }

    console.log("Warm-up match and demo predictions seeded successfully.");
  }

  console.log("Database seed completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
