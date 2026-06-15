"use client";

import { useState, useTransition, useActionState } from "react";
import { 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  submitMatchResult, 
  triggerRecalculate,
  syncMatchesWithApi
} from "@/app/actions/admin";
import { 
  Settings, 
  Plus, 
  Trash2, 
  CheckSquare, 
  RefreshCw, 
  Users, 
  Edit3, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  User as UserIcon,
  AlertCircle,
  Activity
} from "lucide-react";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  totalPoints: number;
}

interface PredictionData {
  id: string;
  userId: string;
  userName: string;
  predictedResult: "TEAM_A" | "DRAW" | "TEAM_B";
  predictedTeamAScore: number | null;
  predictedTeamBScore: number | null;
  pointsAwarded: number;
}

interface MatchData {
  id: string;
  teamA: string;
  teamB: string;
  matchTime: string; // ISO String
  predictionDeadline: string; // ISO String
  status: "UPCOMING" | "LIVE" | "COMPLETED" | "POSTPONED" | "CANCELLED";
  teamAScore: number | null;
  teamBScore: number | null;
  result: "TEAM_A" | "DRAW" | "TEAM_B" | null;
  predictions: PredictionData[];
  officialMatchUrl?: string | null;
  officialBroadcasterUrl?: string | null;
  liveCoverageUrl?: string | null;
  broadcasterName?: string | null;
  broadcasterRegion?: string | null;
  coverageNote?: string | null;
  streamSourceType?: "OFFICIAL" | "BROADCASTER" | "FIFA" | "ADMIN_LINK" | "NONE";
  lastSyncedAt?: string | null;
}

interface AdminPanelProps {
  initialMatches: MatchData[];
  users: UserData[];
}

export default function AdminPanel({ initialMatches, users }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"matches" | "users" | "system">("matches");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [resultMatchId, setResultMatchId] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<any | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncPending, startSyncTransition] = useTransition();
  const [expandedPredictionsMatchId, setExpandedPredictionsMatchId] = useState<string | null>(null);

  // Form states
  const [createState, createFormAction, isCreatePending] = useActionState(createMatch, null);
  const [isActionPending, startTransition] = useTransition();
  
  // Custom message states
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Edit / Result Form temporary inputs
  const [editTeamA, setEditTeamA] = useState("");
  const [editTeamB, setEditTeamB] = useState("");
  const [editMatchTime, setEditMatchTime] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editStatus, setEditStatus] = useState<"UPCOMING" | "LIVE" | "COMPLETED" | "POSTPONED" | "CANCELLED">("UPCOMING");
  const [editOfficialMatchUrl, setEditOfficialMatchUrl] = useState("");
  const [editOfficialBroadcasterUrl, setEditOfficialBroadcasterUrl] = useState("");
  const [editLiveCoverageUrl, setEditLiveCoverageUrl] = useState("");
  const [editBroadcasterName, setEditBroadcasterName] = useState("");
  const [editBroadcasterRegion, setEditBroadcasterRegion] = useState("");
  const [editCoverageNote, setEditCoverageNote] = useState("");
  const [editStreamSourceType, setEditStreamSourceType] = useState<"OFFICIAL" | "BROADCASTER" | "FIFA" | "ADMIN_LINK" | "NONE">("NONE");

  const [resultScoreA, setResultScoreA] = useState("");
  const [resultScoreB, setResultScoreB] = useState("");
  const [resultStatus, setResultStatus] = useState<"LIVE" | "COMPLETED" | "CANCELLED" | "POSTPONED">("COMPLETED");

  const handleEditClick = (match: MatchData) => {
    setActionError(null);
    setActionSuccess(null);
    setResultMatchId(null);
    
    // Format dates to fit datetime-local inputs (YYYY-MM-DDTHH:MM)
    const mTime = new Date(match.matchTime).toISOString().slice(0, 16);
    const dTime = new Date(match.predictionDeadline).toISOString().slice(0, 16);

    setEditingMatchId(match.id);
    setEditTeamA(match.teamA);
    setEditTeamB(match.teamB);
    setEditMatchTime(mTime);
    setEditDeadline(dTime);
    setEditStatus(match.status);
    setEditOfficialMatchUrl(match.officialMatchUrl || "");
    setEditOfficialBroadcasterUrl(match.officialBroadcasterUrl || "");
    setEditLiveCoverageUrl(match.liveCoverageUrl || "");
    setEditBroadcasterName(match.broadcasterName || "");
    setEditBroadcasterRegion(match.broadcasterRegion || "");
    setEditCoverageNote(match.coverageNote || "");
    setEditStreamSourceType(match.streamSourceType || "NONE");
  };

  const handleResultClick = (match: MatchData) => {
    setActionError(null);
    setActionSuccess(null);
    setEditingMatchId(null);

    setResultMatchId(match.id);
    setResultScoreA(match.teamAScore !== null && match.teamAScore !== undefined ? match.teamAScore.toString() : "");
    setResultScoreB(match.teamBScore !== null && match.teamBScore !== undefined ? match.teamBScore.toString() : "");
    setResultStatus(
      match.status === "LIVE"
        ? "LIVE"
        : match.status === "CANCELLED"
        ? "CANCELLED"
        : match.status === "POSTPONED"
        ? "POSTPONED"
        : "COMPLETED"
    );
  };

  const handleUpdateSubmit = async (e: React.FormEvent<HTMLFormElement>, matchId: string) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const mTime = new Date(editMatchTime);
    const dTime = new Date(editDeadline);

    if (editStatus !== "POSTPONED" && dTime > mTime) {
      setActionError("Prediction deadline cannot be after the match start time.");
      return;
    }

    const isValidClientUrl = (url: string) => {
      if (!url) return true;
      const trimmed = url.trim();
      if (trimmed === "") return true;
      try {
        const u = new URL(trimmed);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (_) {
        return false;
      }
    };

    if (!isValidClientUrl(editOfficialMatchUrl) || !isValidClientUrl(editOfficialBroadcasterUrl) || !isValidClientUrl(editLiveCoverageUrl)) {
      setActionError("Invalid live coverage URL. Only http:// and https:// links are allowed.");
      return;
    }

    const formData = new FormData();
    formData.append("teamA", editTeamA);
    formData.append("teamB", editTeamB);
    formData.append("matchTime", editMatchTime);
    formData.append("predictionDeadline", editStatus === "POSTPONED" ? editMatchTime : editDeadline);
    formData.append("status", editStatus);
    formData.append("officialMatchUrl", editOfficialMatchUrl);
    formData.append("officialBroadcasterUrl", editOfficialBroadcasterUrl);
    formData.append("liveCoverageUrl", editLiveCoverageUrl);
    formData.append("broadcasterName", editBroadcasterName);
    formData.append("broadcasterRegion", editBroadcasterRegion);
    formData.append("coverageNote", editCoverageNote);
    formData.append("streamSourceType", editStreamSourceType);

    startTransition(async () => {
      const res = await updateMatch(matchId, formData);
      if (res.success) {
        setActionSuccess("Match updated successfully!");
        setEditingMatchId(null);
      } else {
        setActionError(res.error || "Failed to update match.");
      }
    });
  };

  const handleResultSubmit = async (e: React.FormEvent<HTMLFormElement>, matchId: string) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("scoreA", resultScoreA);
    formData.append("scoreB", resultScoreB);
    formData.append("status", resultStatus);

    startTransition(async () => {
      const res = await submitMatchResult(matchId, formData);
      if (res.success) {
        setActionSuccess("Match result and points calculated successfully!");
        setResultMatchId(null);
      } else {
        setActionError(res.error || "Failed to save result.");
      }
    });
  };

  const handleDeleteClick = async (matchId: string) => {
    if (!confirm("Are you sure you want to delete this match? This will delete all predictions as well!")) return;

    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await deleteMatch(matchId);
      if (res.success) {
        setActionSuccess("Match deleted successfully!");
      } else {
        setActionError(res.error || "Failed to delete match.");
      }
    });
  };

  const handleRecalculate = async () => {
    setActionError(null);
    setActionSuccess(null);
    setSyncError(null);
    setSyncSummary(null);

    startTransition(async () => {
      const res = await triggerRecalculate();
      if (res.success) {
        setActionSuccess("All points recalculated successfully!");
      } else {
        setActionError(res.error || "Recalculation failed.");
      }
    });
  };

  const handleSync = async () => {
    setActionError(null);
    setActionSuccess(null);
    setSyncError(null);
    setSyncSummary(null);

    startSyncTransition(async () => {
      try {
        const res = await syncMatchesWithApi();
        if (res.success) {
          setActionSuccess("World Cup API scores synchronized successfully!");
          setSyncSummary(res.summary);
        } else {
          setSyncError(res.error || "Failed to synchronize matches with API.");
        }
      } catch (err: any) {
        setSyncError("An unexpected error occurred while running the sync. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => {
            setActiveTab("matches");
            setActionError(null);
            setActionSuccess(null);
          }}
          className={`px-6 py-3 border-b-2 text-sm font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "matches"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Manage Matches</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("users");
            setActionError(null);
            setActionSuccess(null);
          }}
          className={`px-6 py-3 border-b-2 text-sm font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "users"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>User Standings</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("system");
            setActionError(null);
            setActionSuccess(null);
          }}
          className={`px-6 py-3 border-b-2 text-sm font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "system"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>System Actions</span>
        </button>
      </div>

      {/* Global Alerts */}
      {actionError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl flex items-center space-x-2 max-w-xl">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-2xl flex items-center space-x-2 max-w-xl">
          <CheckSquare className="h-5 w-5 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* TAB: Matches */}
      {activeTab === "matches" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-100">Match Schedules</h2>
            <button
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setEditingMatchId(null);
                setResultMatchId(null);
              }}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Match</span>
            </button>
          </div>

          {/* Form: Create Match */}
          {showCreateForm && (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl max-w-2xl">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-850 pb-2">
                Create Match Card
              </h3>
              <form action={(fd) => {
                setActionError(null);
                setActionSuccess(null);
                createFormAction(fd);
              }} className="space-y-4">
                {createState?.error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                    {createState.error}
                  </div>
                )}
                {createState?.success && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
                    Match created successfully!
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team A Name</label>
                    <input
                      name="teamA"
                      required
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. Argentina"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team B Name</label>
                    <input
                      name="teamB"
                      required
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. France"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Match Kick-off Time</label>
                    <input
                      type="datetime-local"
                      name="matchTime"
                      required
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Prediction Deadline</label>
                    <input
                      type="datetime-local"
                      name="predictionDeadline"
                      required
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-850 pt-4 mt-4 space-y-4">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Live Broadcast & Coverage Links</h4>
                  <div className="text-[10px] text-slate-400 bg-slate-950 border border-slate-850 p-2.5 rounded-xl">
                    <span className="font-bold text-amber-500">Notice:</span> Only use official broadcaster, FIFA, or legally authorized coverage links. Else use pirate stream aggregators or unofficial mirror links.
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Stream Source Type</label>
                      <select
                        name="streamSourceType"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                      >
                        <option value="NONE">None</option>
                        <option value="OFFICIAL">Official Site</option>
                        <option value="BROADCASTER">Broadcaster</option>
                        <option value="FIFA">FIFA+</option>
                        <option value="ADMIN_LINK">Custom Official Link</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Broadcaster Name</label>
                      <input
                        name="broadcasterName"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. Fox Sports, BBC"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Broadcaster Region</label>
                      <input
                        name="broadcasterRegion"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. US, UK, Global"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Coverage Note</label>
                      <input
                        name="coverageNote"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. Free stream, requires subscription"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Official Match URL</label>
                      <input
                        type="url"
                        name="officialMatchUrl"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="https://www.fifa.com/... (must be http/https)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Official Broadcaster URL</label>
                      <input
                        type="url"
                        name="officialBroadcasterUrl"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="https://... (must be http/https)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Live Coverage URL</label>
                      <input
                        type="url"
                        name="liveCoverageUrl"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="https://... (must be http/https)"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-850 text-slate-400 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatePending}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    {isCreatePending ? "Creating..." : "Save Match"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List of Matches */}
          <div className="grid grid-cols-1 gap-6">
            {initialMatches.map((match) => {
              const matchDate = new Date(match.matchTime);
              const deadlineDate = new Date(match.predictionDeadline);
              const isEditing = editingMatchId === match.id;
              const isEnteringResult = resultMatchId === match.id;

              return (
                <div key={match.id} className="bg-slate-900 border border-slate-850 rounded-2xl shadow-xl overflow-hidden">
                  
                  {/* Card Row */}
                  <div className="p-5 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                    <div className="flex flex-col space-y-2 md:w-5/12">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-slate-200 text-base">
                          {match.teamA} vs {match.teamB}
                        </span>
                        {match.status === "LIVE" ? (
                          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md text-[9px] uppercase font-bold animate-pulse">
                            Live
                          </span>
                        ) : match.status === "COMPLETED" ? (
                          <span className="bg-slate-800 text-slate-400 border border-slate-750 px-2 py-0.5 rounded-md text-[9px] uppercase font-bold">
                            Completed
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md text-[9px] uppercase font-bold">
                            Upcoming
                          </span>
                        )}
                      </div>
                      
                      <div className="text-xs text-slate-400 space-y-0.5">
                        <div>
                          <span className="font-semibold text-slate-500">Kick-off:</span> {matchDate.toLocaleString()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-500">Deadline:</span> {deadlineDate.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Scores (if completed/live) */}
                    <div className="md:w-3/12 flex items-center md:justify-center">
                      {(match.status === "COMPLETED" || match.status === "LIVE") ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Result Score</span>
                          <span className="text-lg font-black text-slate-100 bg-slate-950 border border-slate-850 px-3.5 py-1 rounded-xl mt-1">
                            {match.teamAScore} - {match.teamBScore}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-slate-500">No score recorded</span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="md:w-4/12 flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setExpandedPredictionsMatchId(expandedPredictionsMatchId === match.id ? null : match.id)}
                        className="p-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg border border-slate-850 transition-all cursor-pointer text-xs flex items-center space-x-1"
                        title="View Predictions"
                      >
                        <span>Predictions</span>
                        {expandedPredictionsMatchId === match.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleEditClick(match)}
                        className="p-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-emerald-400 rounded-lg border border-slate-850 transition-all cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleResultClick(match)}
                        className="p-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-amber-400 rounded-lg border border-slate-850 transition-all cursor-pointer"
                        title="Enter Result"
                      >
                        <CheckSquare className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(match.id)}
                        className="p-2 bg-slate-950 hover:bg-red-950/40 text-slate-450 hover:text-red-450 rounded-lg border border-slate-850 hover:border-red-900/40 transition-all cursor-pointer"
                        title="Delete Match"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Form: Edit Details */}
                  {isEditing && (
                    <div className="px-5 py-5 bg-slate-950/40 border-t border-slate-850">
                      <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider mb-3">Edit Match Details</h4>
                      <form onSubmit={(e) => handleUpdateSubmit(e, match.id)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Team A Name</label>
                            <input
                              value={editTeamA}
                              onChange={(e) => setEditTeamA(e.target.value)}
                              required
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Team B Name</label>
                            <input
                              value={editTeamB}
                              onChange={(e) => setEditTeamB(e.target.value)}
                              required
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Match Time</label>
                            <input
                              type="datetime-local"
                              value={editMatchTime}
                              onChange={(e) => setEditMatchTime(e.target.value)}
                              required
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Prediction Deadline</label>
                            <input
                              type="datetime-local"
                              value={editDeadline}
                              onChange={(e) => setEditDeadline(e.target.value)}
                              required
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Status</label>
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as any)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="UPCOMING">Upcoming</option>
                              <option value="LIVE">Live</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="POSTPONED">Postponed</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                          </div>
                        </div>

                        <div className="border-t border-slate-850 pt-4 mt-4 space-y-4">
                          <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Live Broadcast & Coverage Links</h5>
                          <div className="text-[10px] text-slate-400 bg-slate-950 border border-slate-850 p-2.5 rounded-xl">
                            <span className="font-bold text-amber-500">Notice:</span> Only use official broadcaster, FIFA, or legally authorized coverage links. Else use pirate stream aggregators or unofficial mirror links.
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Stream Source Type</label>
                              <select
                                value={editStreamSourceType}
                                onChange={(e) => setEditStreamSourceType(e.target.value as any)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
                              >
                                <option value="NONE">None</option>
                                <option value="OFFICIAL">Official Site</option>
                                <option value="BROADCASTER">Broadcaster</option>
                                <option value="FIFA">FIFA+</option>
                                <option value="ADMIN_LINK">Custom Official Link</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Broadcaster Name</label>
                              <input
                                value={editBroadcasterName}
                                onChange={(e) => setEditBroadcasterName(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="e.g. Fox Sports, BBC"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Broadcaster Region</label>
                              <input
                                value={editBroadcasterRegion}
                                onChange={(e) => setEditBroadcasterRegion(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="e.g. US, UK, Global"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Coverage Note</label>
                              <input
                                value={editCoverageNote}
                                onChange={(e) => setEditCoverageNote(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="e.g. Free stream, requires subscription"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Official Match URL</label>
                              <input
                                type="url"
                                value={editOfficialMatchUrl}
                                onChange={(e) => setEditOfficialMatchUrl(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="https://www.fifa.com/... (must be http/https)"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Official Broadcaster URL</label>
                              <input
                                type="url"
                                value={editOfficialBroadcasterUrl}
                                onChange={(e) => setEditOfficialBroadcasterUrl(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="https://... (must be http/https)"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-450 mb-1">Live Coverage URL</label>
                              <input
                                type="url"
                                value={editLiveCoverageUrl}
                                onChange={(e) => setEditLiveCoverageUrl(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                                placeholder="https://... (must be http/https)"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingMatchId(null)}
                            className="px-3.5 py-1.5 bg-slate-900 text-slate-400 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isActionPending}
                            className="px-4.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-lg font-bold text-xs cursor-pointer"
                          >
                            {isActionPending ? "Saving..." : "Update Match"}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Form: Enter Result */}
                  {isEnteringResult && (
                    <div className="px-5 py-5 bg-slate-950/40 border-t border-slate-850">
                      <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider mb-3">Record Match Outcome</h4>
                      <form onSubmit={(e) => handleResultSubmit(e, match.id)} className="space-y-4">
                        <div className="flex items-center space-x-4 justify-center bg-slate-950 p-4 rounded-2xl max-w-sm mx-auto border border-slate-850">
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-slate-400 mb-1.5 font-bold">{match.teamA}</span>
                            <input
                              type="number"
                              min="0"
                              value={resultScoreA}
                              onChange={(e) => setResultScoreA(e.target.value)}
                              required={resultStatus === "COMPLETED" || resultStatus === "LIVE"}
                              className="w-16 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-center font-bold"
                            />
                          </div>
                          <span className="font-extrabold text-slate-600 mt-5">:</span>
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-slate-400 mb-1.5 font-bold">{match.teamB}</span>
                            <input
                              type="number"
                              min="0"
                              value={resultScoreB}
                              onChange={(e) => setResultScoreB(e.target.value)}
                              required={resultStatus === "COMPLETED" || resultStatus === "LIVE"}
                              className="w-16 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-center font-bold"
                            />
                          </div>
                        </div>

                        <div className="max-w-xs mx-auto">
                          <label className="block text-xs text-slate-450 mb-1.5 text-center font-semibold">Match Status</label>
                          <select
                            value={resultStatus}
                            onChange={(e) => setResultStatus(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 font-bold"
                          >
                            <option value="LIVE">Live (Updating Score Only)</option>
                            <option value="COMPLETED">Completed (Triggers Points Calculation)</option>
                            <option value="CANCELLED">Cancelled (Voids Predictions)</option>
                            <option value="POSTPONED">Postponed (Locks Predictions)</option>
                          </select>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setResultMatchId(null)}
                            className="px-3.5 py-1.5 bg-slate-900 text-slate-400 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isActionPending}
                            className="px-4.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-lg font-bold text-xs cursor-pointer"
                          >
                            {isActionPending ? "Saving..." : "Save Outcome"}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Expanded Predictions Details */}
                  {expandedPredictionsMatchId === match.id && (
                    <div className="px-5 py-4 border-t border-slate-850 bg-slate-950/60">
                      <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider mb-3">All Predictions Submissions</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                        {match.predictions.length === 0 ? (
                          <div className="col-span-2 text-center text-xs text-slate-500 py-3">
                            No predictions submitted for this match yet.
                          </div>
                        ) : (
                          match.predictions.map((p) => (
                            <div key={p.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2.5 truncate">
                                <UserIcon className="h-4.5 w-4.5 text-slate-500 bg-slate-950 border border-slate-850 p-1 rounded-md" />
                                <div className="flex flex-col truncate">
                                  <span className="font-bold text-slate-200 truncate">{p.userName}</span>
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    {match.status === "COMPLETED" ? `${p.pointsAwarded} points` : "Pending"}
                                  </span>
                                </div>
                              </div>
                              
                              <span className="font-black text-slate-300">
                                {p.predictedResult === "TEAM_A" && `${match.teamA} Win`}
                                {p.predictedResult === "TEAM_B" && `${match.teamB} Win`}
                                {p.predictedResult === "DRAW" && "Draw"}
                                {p.predictedTeamAScore !== null && ` (${p.predictedTeamAScore}-${p.predictedTeamBScore})`}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: Users */}
      {activeTab === "users" && (
        <div className="bg-slate-900 border border-slate-850 rounded-2xl shadow-xl overflow-hidden max-w-4xl">
          <div className="px-6 py-4 border-b border-slate-850 bg-slate-950/20">
            <h2 className="text-lg font-bold text-slate-200">Registered Platform Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 text-[10px] text-slate-500 font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5 text-center">System Role</th>
                  <th className="px-6 py-3.5 text-center">Calculated Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-850/25 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-200">{u.name}</td>
                    <td className="px-6 py-4 text-slate-400">{u.email}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                        u.role === "ADMIN" 
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-500" 
                          : "bg-slate-850 border-slate-800 text-slate-400"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-black text-slate-100">{u.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: System Actions */}
      {activeTab === "system" && (
        <div className="space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Card 1: API Synchronization */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Activity className="h-5 w-5" />
                  <h3 className="text-md font-bold text-slate-200">World Cup API Sync</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Synchronize live scores, match timings, and completed results directly from the `worldcup26.ir` API. Completed matches will trigger points calculation automatically.
                </p>
                {(() => {
                  const synced = initialMatches.filter(m => m.lastSyncedAt);
                  if (synced.length === 0) return null;
                  const latest = synced.reduce((lat, cur) => {
                    if (!lat || !cur.lastSyncedAt) return cur.lastSyncedAt || null;
                    return new Date(cur.lastSyncedAt) > new Date(lat) ? cur.lastSyncedAt : lat;
                  }, null as string | null);

                  return latest ? (
                    <div className="text-[10px] text-slate-500 font-semibold flex items-center space-x-1.5 pt-1">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span>Last automatic sync: {new Date(latest).toLocaleString()}</span>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="pt-2">
                <button
                  onClick={handleSync}
                  disabled={isSyncPending || isActionPending}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs cursor-pointer transition-all active:scale-95 w-full justify-center"
                >
                  <Activity className={`h-4 w-4 ${isSyncPending ? "animate-pulse" : ""}`} />
                  <span>{isSyncPending ? "Synchronizing..." : "Sync World Cup API Scores"}</span>
                </button>
              </div>
            </div>

            {/* Card 2: Points Recalculation */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <RefreshCw className="h-5 w-5" />
                  <h3 className="text-md font-bold text-slate-200">Recalculate Standings</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Force a full points recalculation for all predictions based on current completed match scores stored in the database. Fully idempotent and safe.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleRecalculate}
                  disabled={isSyncPending || isActionPending}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 disabled:opacity-50 font-bold text-xs cursor-pointer transition-all active:scale-95 w-full justify-center"
                >
                  <RefreshCw className={`h-4 w-4 ${isActionPending ? "animate-spin" : ""}`} />
                  <span>{isActionPending ? "Recalculating..." : "Force Recalculate Standings"}</span>
                </button>
              </div>
            </div>

          </div>

          {/* Sync Results Display */}
          {(syncSummary || syncError) && (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-slate-850 pb-2">
                Sync Execution Report
              </h3>
              
              {syncError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{syncError}</span>
                </div>
              )}

              {syncSummary && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Total Fetched</span>
                      <span className="text-lg font-black text-slate-100">{syncSummary.totalFetched}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Matched</span>
                      <span className="text-lg font-black text-emerald-450">{syncSummary.matched}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Updated Live</span>
                      <span className="text-lg font-black text-amber-450">{syncSummary.updatedLive}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Completed</span>
                      <span className="text-lg font-black text-emerald-450">{syncSummary.completed}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Points Calc</span>
                      <span className="text-lg font-black text-emerald-400">{syncSummary.pointsCalculated}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Skipped Upcoming</span>
                      <span className="text-lg font-black text-slate-400">{syncSummary.skippedUpcoming}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Admin Finalized</span>
                      <span className="text-lg font-black text-amber-500">{syncSummary.skippedAdminFinalized}</span>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Unmatched</span>
                      <span className="text-lg font-black text-red-400">{syncSummary.unmatched}</span>
                    </div>
                  </div>

                  {syncSummary.errors && syncSummary.errors.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Sync Warnings / Alerts</span>
                      <div className="p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-1 max-h-40 overflow-y-auto">
                        {syncSummary.errors.map((err: string, idx: number) => (
                          <div key={idx} className="text-[11px] text-amber-400 flex items-start space-x-1">
                            <span className="text-amber-500 font-bold mr-1">•</span>
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
