import { NextResponse } from "next/server";
import { runMatchSync } from "@/lib/match-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent") || "";
  const isVercelCron = userAgent.includes("vercel-cron/1.0");

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";

  const cronSecret = process.env.CRON_SECRET;
  const isAuthorizedToken = cronSecret && token === cronSecret;

  // Authorize via Vercel-cron UA or secret bearer token
  if (!isVercelCron && !isAuthorizedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[CRON] Triggering automatic match scores synchronization...");
    const res = await runMatchSync();
    console.log("[CRON] Sync finished with result:", JSON.stringify(res));
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("[CRON] Fatal error during sync execution:", error);
    return NextResponse.json(
      { success: false, error: error.message || error },
      { status: 500 }
    );
  }
}
