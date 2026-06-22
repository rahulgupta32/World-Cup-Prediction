import { getSessionUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { prisma } from "@/lib/db";
import Link from "next/link";
import RealTimePoll from "@/components/RealTimePoll";
import { 
  Trophy, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowRight,
  PlusCircle,
  PlayCircle
} from "lucide-react";

function formatSyncTime(date: Date | null): string {
  if (!date) return "";
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "Just synced";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "Last synced 1 min ago";
  return `Last synced ${minutes} min ago`;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  // 1. Get user statistics from leaderboard
  const leaderboard = await getLeaderboard();
  const userStats = leaderboard.find((entry) => entry.userId === sessionUser.userId) || {
    rank: leaderboard.length + 1,
    totalPoints: 0,
    correctOutcomeCount: 0,
    exactScoreCount: 0,
    wrongPredictions: 0,
    missedPredictions: 0,
    accuracy: 0,
  };

  const totalCorrect = userStats.exactScoreCount + userStats.correctOutcomeCount;

  // 2. Fetch upcoming matches that need predictions
  // An upcoming match needs a prediction if predictionDeadline is in the future
  // and the user has not submitted a prediction yet.
  const now = new Date();
  
  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "UPCOMING",
      predictionDeadline: { gt: now },
    },
    include: {
      predictions: {
        where: { userId: sessionUser.userId },
      },
    },
    orderBy: { matchTime: "asc" },
  });

  const matchesNeedingPrediction = upcomingMatches.filter(
    (m) => m.predictions.length === 0
  );

  // 3. Fetch recently completed matches
  const recentCompletedMatches = await prisma.match.findMany({
    where: {
      status: { in: ["COMPLETED", "CANCELLED"] },
    },
    include: {
      predictions: {
        where: { userId: sessionUser.userId },
      },
    },
    orderBy: { matchTime: "desc" },
    take: 5,
  });

  // 4. Fetch live matches
  const liveMatches = await prisma.match.findMany({
    where: { status: "LIVE" },
    include: {
      predictions: {
        where: { userId: sessionUser.userId },
      },
    },
    orderBy: { matchTime: "asc" },
  });

  return (
    <div className="space-y-8">
      <RealTimePoll />
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Welcome back, <span className="text-emerald-400">{sessionUser.name}</span>!
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Here is your World Cup prediction dashboard. Let's see how you're performing.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Points */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-xl shadow-slate-950/20 relative overflow-hidden group hover:border-emerald-500/20 transition-all">
          <div className="absolute -right-2 -bottom-2 text-emerald-500/5 group-hover:text-emerald-500/10 transition-colors">
            <Trophy className="h-28 w-28" />
          </div>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Points</span>
          <div className="flex items-baseline mt-4 space-x-1.5">
            <span className="text-3xl font-black text-slate-100">{userStats.totalPoints}</span>
            <span className="text-xs text-emerald-400 font-bold">PTS</span>
          </div>
        </div>

        {/* Rank */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-xl shadow-slate-950/20 relative overflow-hidden group hover:border-amber-500/20 transition-all">
          <div className="absolute -right-2 -bottom-2 text-amber-500/5 group-hover:text-amber-500/10 transition-colors">
            <TrendingUp className="h-28 w-28" />
          </div>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Rank</span>
          <div className="flex items-baseline mt-4 space-x-1">
            <span className="text-xs text-slate-400 font-bold">#</span>
            <span className="text-3xl font-black text-amber-400">{userStats.rank}</span>
            <span className="text-xs text-slate-500 font-medium">of {leaderboard.length}</span>
          </div>
        </div>

        {/* Accuracy & Correct Predictions */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-xl shadow-slate-950/20 relative overflow-hidden group hover:border-teal-500/20 transition-all">
          <div className="absolute -right-2 -bottom-2 text-teal-500/5 group-hover:text-teal-500/10 transition-colors">
            <CheckCircle className="h-28 w-28" />
          </div>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Accuracy & Wins</span>
          <div className="mt-4 flex flex-col">
            <span className="text-3xl font-black text-slate-100">{userStats.accuracy}%</span>
            <span className="text-xs text-slate-400 mt-1">
              <span className="text-emerald-400 font-semibold">{totalCorrect}</span> correct,{" "}
              <span className="text-red-400 font-semibold">{userStats.wrongPredictions}</span> wrong
            </span>
          </div>
        </div>

        {/* Missed Predictions */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-xl shadow-slate-950/20 relative overflow-hidden group hover:border-rose-500/20 transition-all">
          <div className="absolute -right-2 -bottom-2 text-rose-500/5 group-hover:text-rose-500/10 transition-colors">
            <AlertCircle className="h-28 w-28" />
          </div>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Missed Predictions</span>
          <div className="flex items-baseline mt-4 space-x-1.5">
            <span className="text-3xl font-black text-slate-100">{userStats.missedPredictions}</span>
            <span className="text-xs text-rose-400 font-semibold">MISSED</span>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Upcoming & Live Matches */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Live Matches section (if any) */}
          {liveMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="h-2.5 w-2.5 bg-red-500 rounded-full animate-ping" />
                <h2 className="text-lg font-bold text-slate-100">Live Matches</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {liveMatches.map((match) => {
                  const pred = match.predictions[0];
                  return (
                    <div key={match.id} className="bg-slate-900 border border-slate-850/80 rounded-2xl p-4 shadow-lg hover:border-red-500/25 transition-all">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px]">
                          Live
                        </span>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                          <span>
                            Started: {new Date(match.matchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {match.lastSyncedAt && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-emerald-500">{formatSyncTime(match.lastSyncedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center space-x-3 w-1/3">
                          <span className="font-bold text-slate-200 text-sm truncate">{match.teamA}</span>
                        </div>
                        <div className="flex items-center justify-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-1.5 font-black text-lg text-red-400 min-w-[70px]">
                          <span>{match.teamAScore ?? 0}</span>
                          <span className="text-slate-655">:</span>
                          <span>{match.teamBScore ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-end space-x-3 w-1/3 text-right">
                          <span className="font-bold text-slate-200 text-sm truncate">{match.teamB}</span>
                        </div>
                      </div>
                      
                      {/* Prediction Status */}
                      <div className="mt-3 pt-3 border-t border-slate-850 flex items-center justify-between text-xs text-slate-400">
                        <span>Your Prediction:</span>
                        {pred ? (
                          <span className="font-bold text-emerald-400">
                            {pred.predictedResult === "TEAM_A" && `${match.teamA} Win`}
                            {pred.predictedResult === "TEAM_B" && `${match.teamB} Win`}
                            {pred.predictedResult === "DRAW" && "Draw"}
                            {pred.predictedTeamAScore !== null && ` (${pred.predictedTeamAScore}-${pred.predictedTeamBScore})`}
                          </span>
                        ) : (
                          <span className="font-medium text-rose-400">No Prediction</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matches Needing Prediction */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-100">Needs Your Prediction</h2>
              <Link 
                href="/matches" 
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 group transition-all"
              >
                <span>View all matches</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {matchesNeedingPrediction.length === 0 ? (
              <div className="bg-slate-900 border border-slate-900 rounded-2xl p-8 text-center text-slate-400">
                <CheckCircle className="h-10 w-10 text-emerald-500/80 mx-auto mb-3" />
                <p className="font-bold text-slate-350">You're all caught up!</p>
                <p className="text-xs text-slate-500 mt-1">No upcoming matches need your prediction right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchesNeedingPrediction.slice(0, 4).map((match) => {
                  const deadline = new Date(match.predictionDeadline);
                  return (
                    <div 
                      key={match.id} 
                      className="bg-slate-900 border border-slate-850/80 hover:border-slate-800/80 rounded-2xl p-4.5 flex flex-col justify-between shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all"
                    >
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-2">
                          <span className="text-amber-500">Upcoming</span>
                          <span className="text-slate-500">
                            Deadline: {deadline.toLocaleDateString([], { month: "short", day: "numeric" })} {deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="text-center font-bold text-slate-200 py-3 flex items-center justify-center space-x-3">
                          <span className="truncate max-w-[80px] text-right">{match.teamA}</span>
                          <span className="text-xs text-emerald-500 font-medium px-2 py-0.5 bg-emerald-500/10 rounded-md">VS</span>
                          <span className="truncate max-w-[80px] text-left">{match.teamB}</span>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-slate-850 flex items-center justify-between">
                        <div className="text-[10px] text-slate-500">
                          Match: {new Date(match.matchTime).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </div>
                        <Link
                          href={`/matches?predict=${match.id}`}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-extrabold text-xs hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          <span>Predict</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Recent Results */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-100">Recent Results</h2>
          </div>

          <div className="bg-slate-900 border border-slate-850/80 rounded-2xl p-5 shadow-lg space-y-4">
            {recentCompletedMatches.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                No matches have completed yet.
              </div>
            ) : (
              <div className="space-y-4 divide-y divide-slate-850">
                {recentCompletedMatches.map((match, idx) => {
                  const pred = match.predictions[0];
                  const points = pred ? pred.pointsAwarded : 0;
                  
                  return (
                    <div key={match.id} className={`flex flex-col ${idx > 0 ? "pt-4" : ""}`}>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
                        <span>{new Date(match.matchTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        {pred ? (
                          <span className={`font-bold px-1.5 py-0.5 rounded-md ${
                            pred.predictionResult === "EXACT_SCORE"
                              ? "bg-amber-400/10 text-amber-450 border border-amber-400/20"
                              : pred.predictionResult === "CORRECT_OUTCOME"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : pred.predictionResult === "VOID"
                              ? "bg-slate-800 text-slate-400 border border-slate-750"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}>
                             {pred.predictionResult === "EXACT_SCORE" && "+5 pts · Exact Score"}
                             {pred.predictionResult === "CORRECT_OUTCOME" && "+3 pts · Correct Outcome"}
                             {pred.predictionResult === "WRONG" && "0 pts · Wrong"}
                             {pred.predictionResult === "VOID" && "0 pts · Void"}
                           </span>
                         ) : (
                           <span className="bg-slate-950 text-slate-500 font-bold px-1.5 py-0.5 rounded-md border border-slate-850">
                             0 pts · Missed
                           </span>
                         )}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center space-x-2 w-1/3">
                          <span className="font-bold text-slate-300 truncate">{match.teamA}</span>
                        </div>
                        <div className="font-black text-slate-200 text-xs bg-slate-950 border border-slate-850 px-2.5 py-0.5 rounded-md">
                          {match.teamAScore} - {match.teamBScore}
                        </div>
                        <div className="flex items-center justify-end space-x-2 w-1/3 text-right">
                          <span className="font-bold text-slate-300 truncate">{match.teamB}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] mt-1">
                        <span className="text-slate-500">Your Prediction:</span>
                        {pred ? (
                          <span className={`font-medium ${pred.predictedResult === match.result ? "text-emerald-400" : "text-slate-400"}`}>
                            {pred.predictedResult === "TEAM_A" && `${match.teamA}`}
                            {pred.predictedResult === "TEAM_B" && `${match.teamB}`}
                            {pred.predictedResult === "DRAW" && "Draw"}
                            {pred.predictedTeamAScore !== null && ` (${pred.predictedTeamAScore}-${pred.predictedTeamBScore})`}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">None</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
