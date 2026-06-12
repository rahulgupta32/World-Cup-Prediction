import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Starting Grandfathering Script (Marking Existing Users Verified)...");

  const confirmVerification = process.env.CONFIRM_VERIFICATION === "true";
  if (!confirmVerification) {
    console.log("=========================================");
    console.log("DRY-RUN MODE ACTIVE. No users will be updated.");
    console.log("Run with CONFIRM_VERIFICATION=true to execute.");
    console.log("=========================================");
  } else {
    console.log("=========================================");
    console.log("LIVE RUN: UPDATING ACCOUNTS ENABLED.");
    console.log("=========================================");
  }

  // Find all unverified users
  const unverifiedUsers = await prisma.user.findMany({
    where: {
      emailVerifiedAt: null,
    },
  });

  console.log(`Found ${unverifiedUsers.length} unverified users currently in the database.`);

  for (const user of unverifiedUsers) {
    console.log(`- User: ${user.name} (${user.email}) -> will be verified.`);
    if (confirmVerification) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      });
    }
  }

  console.log("\n=========================================");
  console.log(`Processed ${unverifiedUsers.length} users.`);
  console.log("=========================================");
}

main()
  .catch((e) => {
    console.error("Verification script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
