import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { History, Calendar, CheckCircle2, AlertTriangle, ArrowRight, HelpCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MyPredictionsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  // Fetch user predictions with match details
  const predictions = await prisma.prediction.findMany({
    where: { userId: sessionUser.userId },
    include: {
      match: true,
    },
    orderBy: {
      match: {
        matchTime: "desc",
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Your Predictions
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          History of all predictions you've submitted, along with points earned.
        </p>
      </div>

      {predictions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-12 text-center text-slate-400 max-w-2xl mx-auto shadow-xl">
          <HelpCircle className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <p className="font-bold text-slate-300 text-lg">You have not made any predictions yet</p>
          <p className="text-xs text-slate-500 mt-2">
            World Cup matches are ready for your predictions! Head over to the matches page to make your choices.
          </p>
          <div className="mt-6">
            <Link 
              href="/matches" 
              className="inline-flex items-center space-x-1 px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all"
            >
              <span>View Matches</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-850/80 rounded-2xl shadow-xl overflow-hidden max-w-5xl mx-auto">
          <div className="px-6 py-4 border-b border-slate-850 bg-slate-950/20">
            <h2 className="text-lg font-bold text-slate-200">Prediction History</h2>
          </div>
          
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 text-[10px] text-slate-500 font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="px-6 py-3.5">Match</th>
                  <th className="px-6 py-3.5 text-center">Match Status</th>
                  <th className="px-6 py-3.5 text-center">Your Prediction</th>
                  <th className="px-6 py-3.5 text-center">Actual Score</th>
                  <th className="px-6 py-3.5 text-center">Points</th>
                  <th className="px-6 py-3.5 text-center hidden md:table-cell">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-sm">
                {predictions.map((pred) => {
                  const match = pred.match;
                  const isMatchCompleted = match.status === "COMPLETED";
                  const isMatchLive = match.status === "LIVE";
                  
                  // Points display styling
                  const points = pred.pointsAwarded;
                  
                  return (
                    <tr key={pred.id} className="hover:bg-slate-850/25 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-200">
                            {match.teamA} vs {match.teamB}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(match.matchTime).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(match.matchTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isMatchCompleted ? (
                          <span className="inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-750 uppercase tracking-wide">
                            Completed
                          </span>
                        ) : isMatchLive ? (
                          <span className="inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wide animate-pulse">
                            Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wide">
                            Upcoming
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-300">
                        <span className="bg-slate-950/40 border border-slate-850 px-2 py-1 rounded-md">
                          {pred.predictedResult === "TEAM_A" && `${match.teamA} Win`}
                          {pred.predictedResult === "TEAM_B" && `${match.teamB} Win`}
                          {pred.predictedResult === "DRAW" && "Draw"}
                          {pred.predictedTeamAScore !== null && ` (${pred.predictedTeamAScore}-${pred.predictedTeamBScore})`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isMatchCompleted ? (
                          <span className="font-extrabold text-slate-200">
                            {match.teamAScore} - {match.teamBScore}
                          </span>
                        ) : isMatchLive ? (
                          <span className="font-extrabold text-red-400">
                            {match.teamAScore ?? 0} - {match.teamBScore ?? 0}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs italic">Not started</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {!isMatchCompleted ? (
                          <span className="text-slate-500 text-xs italic">Pending</span>
                        ) : (
                          <span className={`font-black text-sm px-2 py-0.5 rounded ${
                            points > 0 
                              ? "bg-emerald-500/10 text-emerald-400" 
                              : points < 0 
                              ? "bg-red-500/10 text-red-400" 
                              : "bg-slate-800 text-slate-400"
                          }`}>
                            {points > 0 ? `+${points}` : points}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-xs text-slate-500 hidden md:table-cell">
                        {new Date(pred.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(pred.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
