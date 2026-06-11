"use client";

import { useState, useTransition, useEffect } from "react";
import { submitPrediction } from "@/app/actions/predictions";
import { 
  Trophy, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  User as UserIcon,
  HelpCircle
} from "lucide-react";

interface PredictionData {
  id: string;
  userId: string;
  matchId: string;
  predictedResult: "TEAM_A" | "DRAW" | "TEAM_B";
  predictedTeamAScore: number | null;
  predictedTeamBScore: number | null;
  pointsAwarded: number;
  predictionResult: "EXACT_SCORE" | "CORRECT_OUTCOME" | "WRONG" | "VOID" | null;
  user: {
    name: string;
  };
}

interface MatchData {
  id: string;
  teamA: string;
  teamB: string;
  group?: string | null;
  venue?: string | null;
  matchTime: string;
  predictionDeadline: string;
  status: "UPCOMING" | "LIVE" | "COMPLETED" | "POSTPONED" | "CANCELLED";
  teamAScore: number | null;
  teamBScore: number | null;
  result: "TEAM_A" | "DRAW" | "TEAM_B" | null;
  userPrediction: PredictionData | null;
  predictions: PredictionData[];
}

interface MatchesListProps {
  initialMatches: MatchData[];
  currentUserId: string;
  searchParamsPredictId?: string;
}

export default function MatchesList({ initialMatches, currentUserId, searchParamsPredictId }: MatchesListProps) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "live" | "completed">("upcoming");
  const [expandedPredictMatchId, setExpandedPredictMatchId] = useState<string | null>(searchParamsPredictId || null);
  const [expandedPredictionsMatchId, setExpandedPredictionsMatchId] = useState<string | null>(null);
  
  const [predictedResult, setPredictedResult] = useState<"TEAM_A" | "DRAW" | "TEAM_B" | "">("");
  const [scoreA, setScoreA] = useState<string>("");
  const [scoreB, setScoreB] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [isPending, startTransition] = useTransition();
  const [clientNow, setClientNow] = useState(new Date());

  // 1-second reactive clock for real-time locking
  useEffect(() => {
    const interval = setInterval(() => {
      setClientNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle URL redirect query param
  useEffect(() => {
    if (searchParamsPredictId) {
      const match = initialMatches.find(m => m.id === searchParamsPredictId);
      if (match) {
        const isLocked = clientNow >= new Date(match.predictionDeadline) || match.status !== "UPCOMING";
        if (!isLocked) {
          setExpandedPredictMatchId(searchParamsPredictId);
          if (match.userPrediction) {
            setPredictedResult(match.userPrediction.predictedResult);
            setScoreA(match.userPrediction.predictedTeamAScore?.toString() || "");
            setScoreB(match.userPrediction.predictedTeamBScore?.toString() || "");
          }
        }
      }
    }
  }, [searchParamsPredictId, initialMatches, clientNow]);

  // Filters matches by tab
  const upcomingMatches = initialMatches.filter(m => m.status === "UPCOMING" || m.status === "POSTPONED");
  const liveMatches = initialMatches.filter(m => m.status === "LIVE");
  const completedMatches = initialMatches.filter(m => m.status === "COMPLETED" || m.status === "CANCELLED");

  const filteredMatches = 
    activeTab === "upcoming" ? upcomingMatches :
    activeTab === "live" ? liveMatches : completedMatches;

  const handlePredictClick = (match: MatchData, isLocked: boolean) => {
    setError(null);
    setSuccessMsg(null);
    if (isLocked) return;

    if (expandedPredictMatchId === match.id) {
      setExpandedPredictMatchId(null);
    } else {
      setExpandedPredictMatchId(match.id);
      if (match.userPrediction) {
        setPredictedResult(match.userPrediction.predictedResult);
        setScoreA(match.userPrediction.predictedTeamAScore?.toString() || "");
        setScoreB(match.userPrediction.predictedTeamBScore?.toString() || "");
      } else {
        setPredictedResult("");
        setScoreA("");
        setScoreB("");
      }
    }
  };

  const handleScoreChange = (val: string, type: "A" | "B") => {
    setError(null);
    if (type === "A") {
      setScoreA(val);
      const numA = parseInt(val);
      const numB = parseInt(scoreB);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA > numB) setPredictedResult("TEAM_A");
        else if (numA < numB) setPredictedResult("TEAM_B");
        else setPredictedResult("DRAW");
      }
    } else {
      setScoreB(val);
      const numA = parseInt(scoreA);
      const numB = parseInt(val);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA > numB) setPredictedResult("TEAM_A");
        else if (numA < numB) setPredictedResult("TEAM_B");
        else setPredictedResult("DRAW");
      }
    }
  };

  const handleResultSelect = (res: "TEAM_A" | "DRAW" | "TEAM_B") => {
    setError(null);
    setPredictedResult(res);
    const numA = parseInt(scoreA);
    const numB = parseInt(scoreB);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (res === "TEAM_A" && numA <= numB) {
        setScoreA((numB + 1).toString());
      } else if (res === "TEAM_B" && numB <= numA) {
        setScoreB((numA + 1).toString());
      } else if (res === "DRAW" && numA !== numB) {
        setScoreB(numA.toString());
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>, matchId: string) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!predictedResult) {
      setError("Please select the outcome prediction.");
      return;
    }

    const formData = new FormData();
    formData.append("matchId", matchId);
    formData.append("predictedResult", predictedResult);
    formData.append("scoreA", scoreA);
    formData.append("scoreB", scoreB);

    startTransition(async () => {
      const res = await submitPrediction(formData);
      if (res.success) {
        setSuccessMsg("Prediction saved successfully!");
        setTimeout(() => {
          setExpandedPredictMatchId(null);
          setSuccessMsg(null);
        }, 1500);
      } else {
        setError(res.error || "An error occurred.");
      }
    });
  };

  // Countdown Helper component
  function CountdownTimer({ deadline }: { deadline: string }) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
      const target = new Date(deadline).getTime();
      
      const update = () => {
        const now = new Date().getTime();
        const diff = target - now;
        
        if (diff <= 0) {
          setTimeLeft("Locked");
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m`);
        } else if (minutes > 0) {
          setTimeLeft(`${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${seconds}s`);
        }
      };

      update();
      const timer = setInterval(update, 1000);
      return () => clearInterval(timer);
    }, [deadline]);

    if (timeLeft === "Locked") {
      return (
        <span className="flex items-center text-red-450 font-black bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[10px]">
          <Lock className="h-3 w-3 mr-1" /> Locked
        </span>
      );
    }

    return (
      <span className="flex items-center text-amber-450 font-black bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-md text-[10px]">
        <Clock className="h-3 w-3 mr-1 animate-pulse" /> Closes in {timeLeft}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {(["upcoming", "live", "completed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setExpandedPredictMatchId(null);
              setExpandedPredictionsMatchId(null);
            }}
            className={`px-6 py-3 border-b-2 text-sm font-extrabold capitalize transition-all cursor-pointer ${
              activeTab === tab
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab} ({
              tab === "upcoming" ? upcomingMatches.length :
              tab === "live" ? liveMatches.length : completedMatches.length
            })
          </button>
        ))}
      </div>

      {/* Matches Grid */}
      {filteredMatches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-12 text-center text-slate-400">
          <HelpCircle className="h-12 w-12 text-slate-500 mx-auto mb-3" />
          <p className="font-bold text-slate-350 text-lg">No matches found</p>
          <p className="text-xs text-slate-500 mt-1">There are no matches currently in the "{activeTab}" status.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredMatches.map((match) => {
            const hasPredicted = match.userPrediction !== null;
            const matchDate = new Date(match.matchTime);
            
            // Client-side dynamic locking
            const isMatchLocked = clientNow >= new Date(match.predictionDeadline) || match.status !== "UPCOMING";

            return (
              <div 
                key={match.id}
                className={`bg-slate-900 border rounded-2xl shadow-xl transition-all ${
                  match.status === "LIVE" 
                    ? "border-red-500/20 shadow-red-500/5 hover:border-red-500/30" 
                    : hasPredicted 
                    ? "border-emerald-500/10 hover:border-emerald-500/25" 
                    : "border-slate-850 hover:border-slate-800"
                }`}
              >
                {/* Match Header */}
                <div className="px-5 py-4 border-b border-slate-850 flex justify-between items-center bg-slate-950/40 rounded-t-2xl">
                  <div className="flex flex-col">
                    {match.group && (
                      <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 mb-1 w-max">
                        {match.group}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-slate-300">
                      {matchDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} - {matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {match.venue && (
                      <span className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        {match.venue}
                      </span>
                    )}
                  </div>

                  {/* Status Badge & Deadline */}
                  <div className="flex items-center space-x-2">
                    {match.status === "UPCOMING" ? (
                      <CountdownTimer deadline={match.predictionDeadline} />
                    ) : match.status === "LIVE" ? (
                      <span className="flex items-center text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider animate-pulse">
                        Live
                      </span>
                    ) : match.status === "POSTPONED" ? (
                      <span className="flex items-center text-amber-500 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                        Postponed
                      </span>
                    ) : match.status === "CANCELLED" ? (
                      <span className="flex items-center text-rose-500 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                        Cancelled
                      </span>
                    ) : (
                      <span className="flex items-center text-slate-400 font-bold bg-slate-850 border border-slate-750 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                        Completed
                      </span>
                    )}
                  </div>
                </div>

                {/* Match Score Area */}
                <div className="px-6 py-6 text-center">
                  <div className="flex items-center justify-between">
                    {/* Team A */}
                    <div className="w-5/12 flex flex-col items-center">
                      <span className="font-extrabold text-slate-200 text-base md:text-lg tracking-tight line-clamp-2">
                        {match.teamA}
                      </span>
                    </div>

                    {/* Result Score */}
                    <div className="w-2/12 flex flex-col items-center justify-center">
                      {match.status === "COMPLETED" ? (
                        <div className="flex items-center justify-center space-x-1 bg-slate-950 border border-slate-800 px-3.5 py-1.5 rounded-xl font-black text-lg md:text-xl text-slate-200 min-w-[70px]">
                          <span>{match.teamAScore}</span>
                          <span className="text-slate-500">:</span>
                          <span>{match.teamBScore}</span>
                        </div>
                      ) : match.status === "LIVE" ? (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center justify-center space-x-1 bg-slate-950 border border-red-500/20 px-3.5 py-1.5 rounded-xl font-black text-lg md:text-xl text-red-400 min-w-[70px] animate-pulse">
                            <span>{match.teamAScore ?? 0}</span>
                            <span className="text-red-500/50">:</span>
                            <span>{match.teamBScore ?? 0}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-black px-2.5 py-1 bg-slate-950 border border-slate-850 rounded-lg text-emerald-500/80">
                          VS
                        </span>
                      )}
                    </div>

                    {/* Team B */}
                    <div className="w-5/12 flex flex-col items-center">
                      <span className="font-extrabold text-slate-200 text-base md:text-lg tracking-tight line-clamp-2">
                        {match.teamB}
                      </span>
                    </div>
                  </div>

                  {/* User Prediction Summary */}
                  <div className="mt-5 bg-slate-950/30 rounded-xl p-3 border border-slate-850 flex items-center justify-between text-xs">
                    <span className="text-slate-450 font-medium">Your Prediction:</span>
                    {hasPredicted ? (
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <span className="font-bold text-emerald-400">
                          {match.userPrediction!.predictedResult === "TEAM_A" && `${match.teamA}`}
                          {match.userPrediction!.predictedResult === "TEAM_B" && `${match.teamB}`}
                          {match.userPrediction!.predictedResult === "DRAW" && "Draw"}
                          {match.userPrediction!.predictedTeamAScore !== null && 
                            ` (${match.userPrediction!.predictedTeamAScore}-${match.userPrediction!.predictedTeamBScore})`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <AlertCircle className="h-4 w-4 text-slate-550" />
                        <span className="font-bold text-slate-450">Not Predicted</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Match Footer Actions */}
                <div className="px-5 py-3.5 border-t border-slate-850 bg-slate-950/20 rounded-b-2xl flex justify-between items-center text-xs">
                  {/* Left: Score Points awarded (if completed or cancelled) */}
                  <div className="flex items-center space-x-2">
                    {(match.status === "COMPLETED" || match.status === "CANCELLED") && (
                      <span className={`font-bold px-2 py-1 rounded-md ${
                        match.userPrediction 
                          ? match.userPrediction.pointsAwarded > 0 
                            ? "bg-emerald-500/10 text-emerald-400" 
                            : match.userPrediction.pointsAwarded < 0 
                            ? "bg-red-500/10 text-red-400" 
                            : "bg-slate-800 text-slate-400"
                          : "bg-slate-800/50 text-slate-500"
                      }`}>
                        {match.userPrediction 
                          ? `${match.userPrediction.pointsAwarded > 0 ? "+" : ""}${match.userPrediction.pointsAwarded} points` 
                          : "0 points (Missed)"}
                      </span>
                    )}

                    {/* Result Classification Tag */}
                    {(match.status === "COMPLETED" || match.status === "CANCELLED") && match.userPrediction && (
                      <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${
                        match.userPrediction.predictionResult === "EXACT_SCORE"
                          ? "bg-amber-400/10 text-amber-450 border border-amber-400/20"
                          : match.userPrediction.predictionResult === "CORRECT_OUTCOME"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : match.userPrediction.predictionResult === "VOID"
                          ? "bg-slate-800 text-slate-400 border border-slate-750"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {match.userPrediction.predictionResult === "EXACT_SCORE" && "Exact Score"}
                        {match.userPrediction.predictionResult === "CORRECT_OUTCOME" && "Correct Outcome"}
                        {match.userPrediction.predictionResult === "VOID" && "Void"}
                        {match.userPrediction.predictionResult === "WRONG" && "Wrong"}
                      </span>
                    )}
                  </div>

                  {/* Right: Predict / View predictions buttons */}
                  <div className="flex items-center space-x-2">
                    {/* View all predictions if locked */}
                    {isMatchLocked && (
                      <button
                        onClick={() => setExpandedPredictionsMatchId(expandedPredictionsMatchId === match.id ? null : match.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-all"
                      >
                        <span>Others' Choices</span>
                        {expandedPredictionsMatchId === match.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}

                    {/* Predict button if upcoming */}
                    {match.status === "UPCOMING" && !isMatchLocked && (
                      <button
                        onClick={() => handlePredictClick(match, isMatchLocked)}
                        className={`px-4 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          hasPredicted
                            ? "border border-slate-750 text-slate-300 hover:text-white hover:bg-slate-850"
                            : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        }`}
                      >
                        {hasPredicted ? "Edit Prediction" : "Predict"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Prediction Form */}
                {expandedPredictMatchId === match.id && !isMatchLocked && (
                  <div className="px-6 py-5 border-t border-slate-850 bg-slate-950/40 rounded-b-2xl">
                    <form onSubmit={(e) => handleFormSubmit(e, match.id)} className="space-y-4">
                      {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                          {error}
                        </div>
                      )}
                      {successMsg && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
                          {successMsg}
                        </div>
                      )}

                      {/* Step 1: Predict Winner */}
                      <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          1. Predict Outcome
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleResultSelect("TEAM_A")}
                            className={`py-2 px-3 border rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                              predictedResult === "TEAM_A"
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                : "bg-slate-950 border-slate-800 text-slate-355 hover:border-slate-700"
                            }`}
                          >
                            {match.teamA} Win
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResultSelect("DRAW")}
                            className={`py-2 px-3 border rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                              predictedResult === "DRAW"
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                : "bg-slate-950 border-slate-800 text-slate-355 hover:border-slate-700"
                            }`}
                          >
                            Draw
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResultSelect("TEAM_B")}
                            className={`py-2 px-3 border rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                              predictedResult === "TEAM_B"
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                : "bg-slate-950 border-slate-800 text-slate-355 hover:border-slate-700"
                            }`}
                          >
                            {match.teamB} Win
                          </button>
                        </div>
                      </div>

                      {/* Step 2: Score prediction (Optional) */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                            2. Predict Exact Score (Optional for +2 Bonus)
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Leave both empty for outcome-only prediction
                          </span>
                        </div>
                        <div className="flex items-center justify-center space-x-3 bg-slate-950/60 border border-slate-850 p-3 rounded-xl max-w-xs mx-auto">
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] text-slate-400 mb-1 font-semibold truncate max-w-[80px]">{match.teamA}</span>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={scoreA}
                              onChange={(e) => handleScoreChange(e.target.value, "A")}
                              className="w-16 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                              placeholder="0"
                            />
                          </div>
                          <span className="font-extrabold text-slate-600 mt-4">:</span>
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] text-slate-400 mb-1 font-semibold truncate max-w-[80px]">{match.teamB}</span>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={scoreB}
                              onChange={(e) => handleScoreChange(e.target.value, "B")}
                              className="w-16 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex justify-end space-x-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setExpandedPredictMatchId(null)}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 rounded-xl font-bold text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isPending}
                          className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl font-extrabold text-xs cursor-pointer"
                        >
                          {isPending ? "Saving..." : "Save Prediction"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Expanded Others' Predictions */}
                {expandedPredictionsMatchId === match.id && isMatchLocked && (
                  <div className="px-5 py-4 border-t border-slate-850 bg-slate-950/60 rounded-b-2xl">
                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      All Users' Choices
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {match.predictions.filter(p => p.userId !== currentUserId).length === 0 ? (
                        <div className="col-span-2 text-center text-xs text-slate-500 py-2">
                          No other users submitted predictions for this match.
                        </div>
                      ) : (
                        match.predictions
                          .filter((p) => p.userId !== currentUserId)
                          .map((p) => {
                            const isCorrect = (match.status === "COMPLETED" || match.status === "CANCELLED") && p.predictedResult === match.result;
                            return (
                              <div 
                                key={p.id} 
                                className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800/80 rounded-xl text-xs"
                              >
                                <div className="flex items-center space-x-2 truncate">
                                  <UserIcon className="h-3 w-3 text-slate-500 flex-shrink-0" />
                                  <span className="font-semibold text-slate-300 truncate max-w-[100px]">
                                    {p.user.name}
                                  </span>
                                </div>
                                <span className={`font-bold ${
                                  (match.status !== "COMPLETED" && match.status !== "CANCELLED")
                                    ? "text-slate-400" 
                                    : isCorrect 
                                    ? "text-emerald-450" 
                                    : "text-slate-500"
                                }`}>
                                  {p.predictedResult === "TEAM_A" && `${match.teamA} Win`}
                                  {p.predictedResult === "TEAM_B" && `${match.teamB} Win`}
                                  {p.predictedResult === "DRAW" && "Draw"}
                                  {p.predictedTeamAScore !== null && ` (${p.predictedTeamAScore}-${p.predictedTeamBScore})`}
                                </span>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
