import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLeaderboard } from "@/lib/leaderboard";
import AdminPanel from "@/components/AdminPanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sessionUser = await getSessionUser();

  // 1. Verify user session and ADMIN role
  if (!sessionUser || sessionUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // 2. Fetch matches with predictions and user details
  const matches = await prisma.match.findMany({
    include: {
      predictions: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { matchTime: "asc" },
  });

  // 3. Fetch all users
  const dbUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });

  // 4. Fetch leaderboard entries to map points
  const leaderboard = await getLeaderboard();

  // Map leaderboard points to users list
  const usersWithPoints = dbUsers.map((u) => {
    const entry = leaderboard.find((e) => e.userId === u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      totalPoints: entry ? entry.totalPoints : 0,
    };
  });

  // 5. Format matches for client serialization
  const formattedMatches = matches.map((match) => ({
    id: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    matchTime: match.matchTime.toISOString(),
    predictionDeadline: match.predictionDeadline.toISOString(),
    status: match.status,
    teamAScore: match.teamAScore,
    teamBScore: match.teamBScore,
    result: match.result,
    predictions: match.predictions.map((p) => ({
      id: p.id,
      userId: p.userId,
      userName: p.user.name,
      predictedResult: p.predictedResult,
      predictedTeamAScore: p.predictedTeamAScore,
      predictedTeamBScore: p.predictedTeamBScore,
      pointsAwarded: p.pointsAwarded,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 flex items-center space-x-2">
          <span>Platform Administration</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-450">
          Create, edit, and delete matches, record results, inspect user predictions, and trigger recalculations.
        </p>
      </div>

      <AdminPanel initialMatches={formattedMatches} users={usersWithPoints} />
    </div>
  );
}
