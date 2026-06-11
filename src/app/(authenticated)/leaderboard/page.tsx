import { getSessionUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { Trophy, Award, Search, Percent, ShieldCheck } from "lucide-react";
import RealTimePoll from "@/components/RealTimePoll";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  const entries = await getLeaderboard();

  // Split into podium (top 3) and rest
  const firstPlace = entries.find(e => e.rank === 1);
  // Find second place (excluding 1st place user(s))
  const secondPlace = entries.find(e => e.rank === 2);
  // Find third place (excluding 1st & 2nd place user(s))
  const thirdPlace = entries.find(e => e.rank === 3);

  // If there are ties for rank 1, they might all be rank 1. Let's get them by index if no distinct ranks.
  const p1 = entries[0] || null;
  const p2 = entries[1] || null;
  const p3 = entries[2] || null;

  const hasCompletedMatches = entries.some(
    (e) => e.submittedCompletedCount > 0 || e.missedPredictions > 0
  );

  return (
    <div className="space-y-8">
      <RealTimePoll />
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Leaderboard Standings
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Track standings, total points, correct outcomes, and prediction accuracy.
        </p>
      </div>

      {!hasCompletedMatches ? (
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-12 text-center text-slate-400 max-w-2xl mx-auto shadow-xl">
          <Trophy className="h-14 w-14 text-slate-650 mx-auto mb-4" />
          <p className="font-bold text-slate-300 text-lg">Leaderboard will appear after completed matches</p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Points are calculated only after matches are marked as completed. Run the seed data script or enter match results in the Admin Panel to populate the leaderboard.
          </p>
        </div>
      ) : (
        <>
          {/* Podium Section */}
          <div className="grid grid-cols-3 gap-2 sm:gap-6 max-w-3xl mx-auto pt-8 pb-4 items-end">
            
            {/* 2nd Place */}
            {p2 && (
              <div className="flex flex-col items-center">
                <div className="relative mb-3 flex flex-col items-center">
                  <Award className="h-8 w-8 text-slate-300 drop-shadow-[0_0_8px_rgba(203,213,225,0.2)]" />
                  <span className="text-[10px] font-black text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/60 mt-1">
                    2nd
                  </span>
                </div>
                <div className="text-center w-full px-1">
                  <p className={`text-xs sm:text-sm font-bold truncate ${p2.userId === sessionUser.userId ? "text-emerald-400" : "text-slate-200"}`}>
                    {p2.name}
                  </p>
                  <p className="text-xs font-black text-slate-400">{p2.totalPoints} pts</p>
                  <p className="text-[9px] text-slate-500">{p2.accuracy}% acc</p>
                </div>
                {/* Podium pedestal bar */}
                <div className="w-full h-24 bg-slate-900 border-t border-x border-slate-800/80 rounded-t-xl mt-4 flex items-center justify-center shadow-lg shadow-slate-950/40 relative overflow-hidden">
                  <div className="absolute top-0 w-full h-1 bg-slate-750" />
                  <span className="text-3xl font-black text-slate-700 select-none">2</span>
                </div>
              </div>
            )}

            {/* 1st Place */}
            {p1 && (
              <div className="flex flex-col items-center z-10">
                <div className="relative mb-3 flex flex-col items-center">
                  <Trophy className="h-12 w-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.3)] animate-bounce" />
                  <span className="text-[10px] font-black text-slate-950 bg-amber-400 px-2.5 py-0.5 rounded-full border border-amber-300 mt-1 shadow-md shadow-amber-500/10">
                    1st
                  </span>
                </div>
                <div className="text-center w-full px-1">
                  <p className={`text-sm sm:text-base font-extrabold truncate ${p1.userId === sessionUser.userId ? "text-emerald-400" : "text-slate-100"}`}>
                    {p1.name}
                  </p>
                  <p className="text-sm font-black text-amber-400">{p1.totalPoints} pts</p>
                  <p className="text-[10px] text-slate-400">{p1.accuracy}% acc</p>
                </div>
                {/* Podium pedestal bar */}
                <div className="w-full h-32 bg-slate-900 border-t-2 border-x border-amber-500/15 rounded-t-2xl mt-4 flex items-center justify-center shadow-2xl shadow-slate-950/60 relative overflow-hidden">
                  <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-yellow-300" />
                  <span className="text-4xl font-black text-amber-500/40 select-none">1</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {p3 && (
              <div className="flex flex-col items-center">
                <div className="relative mb-3 flex flex-col items-center">
                  <Award className="h-8 w-8 text-amber-700 drop-shadow-[0_0_8px_rgba(180,83,9,0.2)]" />
                  <span className="text-[10px] font-black text-amber-700 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/60 mt-1">
                    3rd
                  </span>
                </div>
                <div className="text-center w-full px-1">
                  <p className={`text-xs sm:text-sm font-bold truncate ${p3.userId === sessionUser.userId ? "text-emerald-400" : "text-slate-200"}`}>
                    {p3.name}
                  </p>
                  <p className="text-xs font-black text-slate-400">{p3.totalPoints} pts</p>
                  <p className="text-[9px] text-slate-500">{p3.accuracy}% acc</p>
                </div>
                {/* Podium pedestal bar */}
                <div className="w-full h-16 bg-slate-900 border-t border-x border-slate-800/80 rounded-t-xl mt-4 flex items-center justify-center shadow-lg shadow-slate-950/40 relative overflow-hidden">
                  <div className="absolute top-0 w-full h-1 bg-amber-750/30" />
                  <span className="text-2xl font-black text-slate-800 select-none">3</span>
                </div>
              </div>
            )}

          </div>

          {/* Standings Table */}
          <div className="bg-slate-900 border border-slate-850/80 rounded-2xl shadow-xl overflow-hidden max-w-5xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-850 bg-slate-950/20">
              <h2 className="text-lg font-bold text-slate-200">Standings Details</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 text-[10px] text-slate-500 font-extrabold uppercase tracking-wider bg-slate-950/30">
                    <th className="px-6 py-3.5 text-center w-16">Rank</th>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5 text-center">Points</th>
                    <th className="px-6 py-3.5 text-center text-emerald-400">Wins</th>
                    <th className="px-6 py-3.5 text-center text-red-400">Losses</th>
                    <th className="px-6 py-3.5 text-center text-slate-400">Missed</th>
                    <th className="px-6 py-3.5 text-center">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-sm">
                  {entries.map((entry) => {
                    const isSelf = entry.userId === sessionUser.userId;
                    return (
                      <tr 
                        key={entry.userId}
                        className={`hover:bg-slate-850/35 transition-colors ${
                          isSelf 
                            ? "bg-emerald-500/5 hover:bg-emerald-500/10 font-semibold" 
                            : ""
                        }`}
                      >
                        <td className="px-6 py-4 text-center font-bold">
                          {entry.rank === 1 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs">
                              1
                            </span>
                          ) : entry.rank === 2 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-300/10 text-slate-300 border border-slate-300/20 text-xs">
                              2
                            </span>
                          ) : entry.rank === 3 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700/10 text-amber-700 border border-amber-700/20 text-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">{entry.rank}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2.5">
                            <span className={`text-slate-200 truncate ${isSelf ? "text-emerald-400 font-bold" : ""}`}>
                              {entry.name}
                            </span>
                            {entry.role === "ADMIN" && (
                              <span className="inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                Admin
                              </span>
                            )}
                            {isSelf && (
                              <span className="inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-100">
                          {entry.totalPoints}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-emerald-400">
                          {entry.correctPredictions}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-red-400">
                          {entry.wrongPredictions}
                        </td>
                        <td className="px-6 py-4 text-center text-slate-450">
                          {entry.missedPredictions}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-300">
                          <div className="flex items-center justify-center space-x-1.5">
                            <span>{entry.accuracy}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
