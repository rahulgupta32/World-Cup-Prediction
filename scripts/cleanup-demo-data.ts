import "dotenv/config";
import { prisma } from "../src/lib/db";

async function run() {
  console.log("Starting production database cleanup of demo data...");
  
  const demoEmails = [
    "alice@league.com",
    "bob@league.com",
    "charlie@league.com",
    "david@league.com",
    "emma@league.com"
  ];

  // 1. Find the demo users
  const demoUsers = await prisma.user.findMany({
    where: {
      email: { in: demoEmails }
    }
  });

  const demoUserIds = demoUsers.map(u => u.id);
  console.log(`Found ${demoUsers.length} demo users to delete.`);

  // 2. Find the warm-up match (USA vs Canada)
  const warmupMatch = await prisma.match.findFirst({
    where: {
      OR: [
        { teamA: "USA", teamB: "Canada" },
        { apiProvider: "demo", apiMatchId: "warmup" }
      ]
    }
  });

  if (warmupMatch) {
    console.log(`Found warm-up match: ${warmupMatch.teamA} vs ${warmupMatch.teamB} (ID: ${warmupMatch.id})`);
  } else {
    console.log("Warm-up match not found (or already deleted).");
  }

  let deletedPredictionsCount = 0;
  let deletedMatchesCount = 0;
  let deletedUsersCount = 0;

  // 3. Delete predictions for these users or for the warm-up match
  if (demoUserIds.length > 0 || warmupMatch) {
    const deletePreds = await prisma.prediction.deleteMany({
      where: {
        OR: [
          { userId: { in: demoUserIds } },
          warmupMatch ? { matchId: warmupMatch.id } : {}
        ]
      }
    });
    deletedPredictionsCount = deletePreds.count;
    console.log(`Deleted ${deletedPredictionsCount} predictions related to demo users or warm-up match.`);
  }

  // 4. Delete the warm-up match
  if (warmupMatch) {
    await prisma.match.delete({
      where: { id: warmupMatch.id }
    });
    deletedMatchesCount = 1;
    console.log("Deleted warm-up match.");
  }

  // 5. Delete the demo users
  if (demoUserIds.length > 0) {
    const deleteUsers = await prisma.user.deleteMany({
      where: {
        id: { in: demoUserIds }
      }
    });
    deletedUsersCount = deleteUsers.count;
    console.log(`Deleted ${deletedUsersCount} demo users.`);
  }

  // 6. Get stats of preserved data
  const remainingUsers = await prisma.user.findMany({
    select: { name: true, email: true, role: true }
  });
  const remainingMatches = await prisma.match.findMany({
    select: { teamA: true, teamB: true, group: true }
  });

  console.log("\n================ CLEANUP SUMMARY ================");
  console.log(`Demo Users Deleted: ${deletedUsersCount}`);
  console.log(`Demo Matches Deleted: ${deletedMatchesCount}`);
  console.log(`Associated Predictions Deleted: ${deletedPredictionsCount}`);
  console.log("\n================ PRESERVED USERS ================");
  remainingUsers.forEach(u => {
    console.log(`- Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);
  });
  console.log(`\nPreserved Official Matches count: ${remainingMatches.length}`);
  console.log("================================================");
}

run()
  .catch(err => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
