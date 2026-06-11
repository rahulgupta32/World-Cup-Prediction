import "dotenv/config";
import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { Outcome, PredictionResult, MatchStatus } from "@prisma/client";

async function main() {
  console.log("Seeding database...");

  const isProd = process.env.NODE_ENV === "production";
  const seedDemo = process.env.SEED_DEMO_DATA === "true";

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

  // Clear existing database in dependency order
  console.log("Clearing existing data...");
  await prisma.prediction.deleteMany();
  await prisma.match.deleteMany();
  await prisma.user.deleteMany();

  // 1. Always seed Admin User
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: adminEmail,
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log(`Admin user created: ${admin.email}`);

  // 2. Conditional Demo Seeding
  let aliceId = "";
  let bobId = "";
  let charlieId = "";
  let davidId = "";
  let emmaId = "";

  if (seedDemo) {
    console.log("Seeding demo data...");
    const demoPasswordHash = await bcrypt.hash("password123", 10);

    const alice = await prisma.user.create({
      data: { name: "Alice Smith", email: "alice@league.com", passwordHash: demoPasswordHash, role: "USER" },
    });
    const bob = await prisma.user.create({
      data: { name: "Bob Jones", email: "bob@league.com", passwordHash: demoPasswordHash, role: "USER" },
    });
    const charlie = await prisma.user.create({
      data: { name: "Charlie Brown", email: "charlie@league.com", passwordHash: demoPasswordHash, role: "USER" },
    });
    const david = await prisma.user.create({
      data: { name: "David Miller", email: "david@league.com", passwordHash: demoPasswordHash, role: "USER" },
    });
    const emma = await prisma.user.create({
      data: { name: "Emma Wilson", email: "emma@league.com", passwordHash: demoPasswordHash, role: "USER" },
    });

    aliceId = alice.id;
    bobId = bob.id;
    charlieId = charlie.id;
    davidId = david.id;
    emmaId = emma.id;

    console.log("Demo users created.");

    // Seed one completed warm-up match
    const warmupMatch = await prisma.match.create({
      data: {
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
      },
    });

    // Seed mock predictions for the warm-up match
    // Alice predicted EXACT_SCORE (2-1) -> +5 points
    await prisma.prediction.create({
      data: {
        userId: aliceId,
        matchId: warmupMatch.id,
        predictedResult: Outcome.TEAM_A,
        predictedTeamAScore: 2,
        predictedTeamBScore: 1,
        pointsAwarded: 5,
        predictionResult: PredictionResult.EXACT_SCORE,
        isCalculated: true,
      },
    });

    // Bob predicted CORRECT_OUTCOME (1-0) -> +2 points
    await prisma.prediction.create({
      data: {
        userId: bobId,
        matchId: warmupMatch.id,
        predictedResult: Outcome.TEAM_A,
        predictedTeamAScore: 1,
        predictedTeamBScore: 0,
        pointsAwarded: 2,
        predictionResult: PredictionResult.CORRECT_OUTCOME,
        isCalculated: true,
      },
    });

    // Charlie predicted WRONG (1-1 DRAW) -> -1 points
    await prisma.prediction.create({
      data: {
        userId: charlieId,
        matchId: warmupMatch.id,
        predictedResult: Outcome.DRAW,
        predictedTeamAScore: 1,
        predictedTeamBScore: 1,
        pointsAwarded: -1,
        predictionResult: PredictionResult.WRONG,
        isCalculated: true,
      },
    });

    // David predicted WRONG (0-2 TEAM_B) -> -1 points
    await prisma.prediction.create({
      data: {
        userId: davidId,
        matchId: warmupMatch.id,
        predictedResult: Outcome.TEAM_B,
        predictedTeamAScore: 0,
        predictedTeamBScore: 2,
        pointsAwarded: -1,
        predictionResult: PredictionResult.WRONG,
        isCalculated: true,
      },
    });

    // Emma predicted EXACT_SCORE (2-1) -> +5 points
    await prisma.prediction.create({
      data: {
        userId: emmaId,
        matchId: warmupMatch.id,
        predictedResult: Outcome.TEAM_A,
        predictedTeamAScore: 2,
        predictedTeamBScore: 1,
        pointsAwarded: 5,
        predictionResult: PredictionResult.EXACT_SCORE,
        isCalculated: true,
      },
    });

    console.log("Warm-up match and demo predictions seeded successfully.");
  }

  // 3. Always Seed Official FIFA World Cup 2026 Opening 24 matches
  console.log("Seeding 24 official opening group stage matches...");
  const officialMatches = [
    {
      teamA: "Mexico",
      teamB: "South Africa",
      matchTime: new Date("2026-06-11T19:00:00Z"),
      group: "Group A",
      venue: "Mexico City Stadium (Estadio Azteca)",
    },
    {
      teamA: "Korea Republic",
      teamB: "Czechia",
      matchTime: new Date("2026-06-12T02:00:00Z"),
      group: "Group A",
      venue: "Guadalajara Stadium",
    },
    {
      teamA: "Canada",
      teamB: "Bosnia and Herzegovina",
      matchTime: new Date("2026-06-12T19:00:00Z"),
      group: "Group B",
      venue: "Toronto Stadium",
    },
    {
      teamA: "USA",
      teamB: "Paraguay",
      matchTime: new Date("2026-06-13T01:00:00Z"),
      group: "Group D",
      venue: "Los Angeles Stadium (SoFi Stadium)",
    },
    {
      teamA: "Qatar",
      teamB: "Switzerland",
      matchTime: new Date("2026-06-13T19:00:00Z"),
      group: "Group B",
      venue: "San Francisco Bay Stadium",
    },
    {
      teamA: "Brazil",
      teamB: "Morocco",
      matchTime: new Date("2026-06-13T22:00:00Z"),
      group: "Group C",
      venue: "New York New Jersey Stadium",
    },
    {
      teamA: "Haiti",
      teamB: "Scotland",
      matchTime: new Date("2026-06-14T01:00:00Z"),
      group: "Group C",
      venue: "Boston Stadium",
    },
    {
      teamA: "Australia",
      teamB: "Türkiye",
      matchTime: new Date("2026-06-14T04:00:00Z"),
      group: "Group D",
      venue: "BC Place Vancouver",
    },
    {
      teamA: "Germany",
      teamB: "Curaçao",
      matchTime: new Date("2026-06-14T16:00:00Z"),
      group: "Group E",
      venue: "Houston Stadium",
    },
    {
      teamA: "Ivory Coast",
      teamB: "Ecuador",
      matchTime: new Date("2026-06-14T19:00:00Z"),
      group: "Group E",
      venue: "Atlanta Stadium",
    },
    {
      teamA: "Netherlands",
      teamB: "Japan",
      matchTime: new Date("2026-06-14T19:00:00Z"),
      group: "Group F",
      venue: "Dallas Stadium",
    },
    {
      teamA: "Sweden",
      teamB: "Tunisia",
      matchTime: new Date("2026-06-14T22:00:00Z"),
      group: "Group F",
      venue: "Miami Stadium",
    },
    {
      teamA: "Belgium",
      teamB: "Egypt",
      matchTime: new Date("2026-06-15T16:00:00Z"),
      group: "Group G",
      venue: "Seattle Stadium",
    },
    {
      teamA: "Iran",
      teamB: "New Zealand",
      matchTime: new Date("2026-06-15T19:00:00Z"),
      group: "Group G",
      venue: "Kansas City Stadium",
    },
    {
      teamA: "Spain",
      teamB: "Cape Verde",
      matchTime: new Date("2026-06-15T22:00:00Z"),
      group: "Group H",
      venue: "Dallas Stadium",
    },
    {
      teamA: "Saudi Arabia",
      teamB: "Uruguay",
      matchTime: new Date("2026-06-16T01:00:00Z"),
      group: "Group H",
      venue: "Los Angeles Stadium",
    },
    {
      teamA: "France",
      teamB: "Senegal",
      matchTime: new Date("2026-06-16T16:00:00Z"),
      group: "Group I",
      venue: "New York New Jersey Stadium",
    },
    {
      teamA: "Iraq",
      teamB: "Norway",
      matchTime: new Date("2026-06-16T19:00:00Z"),
      group: "Group I",
      venue: "Boston Stadium",
    },
    {
      teamA: "Argentina",
      teamB: "Algeria",
      matchTime: new Date("2026-06-16T22:00:00Z"),
      group: "Group J",
      venue: "Cincinnati Stadium",
    },
    {
      teamA: "Austria",
      teamB: "Jordan",
      matchTime: new Date("2026-06-17T01:00:00Z"),
      group: "Group J",
      venue: "Philadelphia Stadium",
    },
    {
      teamA: "Portugal",
      teamB: "DR Congo",
      matchTime: new Date("2026-06-17T16:00:00Z"),
      group: "Group K",
      venue: "Houston Stadium",
    },
    {
      teamA: "Uzbekistan",
      teamB: "Colombia",
      matchTime: new Date("2026-06-17T19:00:00Z"),
      group: "Group K",
      venue: "San Francisco Bay Stadium",
    },
    {
      teamA: "England",
      teamB: "Croatia",
      matchTime: new Date("2026-06-17T19:00:00Z"),
      group: "Group L",
      venue: "Dallas Stadium",
    },
    {
      teamA: "Ghana",
      teamB: "Panama",
      matchTime: new Date("2026-06-17T22:00:00Z"),
      group: "Group L",
      venue: "Atlanta Stadium",
    },
  ];

  for (const m of officialMatches) {
    const createdMatch = await prisma.match.create({
      data: {
        teamA: m.teamA,
        teamB: m.teamB,
        matchTime: m.matchTime,
        predictionDeadline: m.matchTime, // predictionDeadline strictly equal to matchTime
        status: MatchStatus.UPCOMING,
        group: m.group,
        venue: m.venue,
        source: "Official FIFA Schedule",
        sourceUpdatedAt: new Date(),
      },
    });

    // Seed some mock upcoming predictions to make the UI look rich if demo data is enabled
    if (seedDemo) {
      // Alice predicts team A win
      if (m.teamA === "Mexico") {
        await prisma.prediction.create({
          data: {
            userId: aliceId,
            matchId: createdMatch.id,
            predictedResult: Outcome.TEAM_A,
            predictedTeamAScore: 2,
            predictedTeamBScore: 1,
          },
        });
        // Bob predicts draw
        await prisma.prediction.create({
          data: {
            userId: bobId,
            matchId: createdMatch.id,
            predictedResult: Outcome.DRAW,
            predictedTeamAScore: 1,
            predictedTeamBScore: 1,
          },
        });
      } else if (m.teamA === "Canada") {
        await prisma.prediction.create({
          data: {
            userId: charlieId,
            matchId: createdMatch.id,
            predictedResult: Outcome.TEAM_A,
            predictedTeamAScore: 1,
            predictedTeamBScore: 0,
          },
        });
      }
    }
  }

  console.log("All 24 official matches seeded successfully!");
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
