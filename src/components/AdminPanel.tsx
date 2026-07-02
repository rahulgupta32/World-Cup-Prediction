"use client";

import { useState, useTransition, useActionState, useEffect } from "react";
import { 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  submitMatchResult, 
  triggerRecalculate,
  syncMatchesWithApi,
  syncKnockoutFixturesWithApi,
  reconcileFixtures,
  getFotmobConfigStatus
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
  stage?: "GROUP" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "THIRD_PLACE" | "FINAL";
  isKnockout?: boolean;
  decidedBy?: "NORMAL_TIME" | "EXTRA_TIME" | "PENALTIES" | "CANCELLED" | "VOID";
  winnerTeam?: string | null;
  penaltyTeamAScore?: number | null;
  penaltyTeamBScore?: number | null;
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
  const [knockoutSummary, setKnockoutSummary] = useState<any | null>(null);
  const [reconcileResult, setReconcileResult] = useState<any | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("worldcup");
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

  // Edit Knockout specific states
  const [editStage, setEditStage] = useState<string>("GROUP");
  const [editIsKnockout, setEditIsKnockout] = useState<boolean>(false);
  const [editDecidedBy, setEditDecidedBy] = useState<string>("NORMAL_TIME");
  const [editWinnerTeam, setEditWinnerTeam] = useState<string>("");

  const [resultScoreA, setResultScoreA] = useState("");
  const [resultScoreB, setResultScoreB] = useState("");
  const [resultStatus, setResultStatus] = useState<"LIVE" | "COMPLETED" | "CANCELLED" | "POSTPONED">("COMPLETED");

  // Result Knockout specific states
  const [resultStage, setResultStage] = useState<string>("GROUP");
  const [resultIsKnockout, setResultIsKnockout] = useState<boolean>(false);
  const [resultDecidedBy, setResultDecidedBy] = useState<string>("NORMAL_TIME");
  const [resultWinnerTeam, setResultWinnerTeam] = useState<string>("");
  const [resultPenaltyScoreA, setResultPenaltyScoreA] = useState("");
  const [resultPenaltyScoreB, setResultPenaltyScoreB] = useState("");

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

    setEditStage(match.stage || "GROUP");
    setEditIsKnockout(match.isKnockout || false);
    setEditDecidedBy(match.decidedBy || "NORMAL_TIME");
    setEditWinnerTeam(match.winnerTeam || "");
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

    setResultStage(match.stage || "GROUP");
    setResultIsKnockout(match.isKnockout || false);
    setResultDecidedBy(match.decidedBy || "NORMAL_TIME");
    setResultWinnerTeam(match.winnerTeam || "");
    setResultPenaltyScoreA(match.penaltyTeamAScore !== null && match.penaltyTeamAScore !== undefined ? match.penaltyTeamAScore.toString() : "");
    setResultPenaltyScoreB(match.penaltyTeamBScore !== null && match.penaltyTeamBScore !== undefined ? match.penaltyTeamBScore.toString() : "");
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
    formData.append("stage", editStage);
    formData.append("isKnockout", editIsKnockout ? "true" : "false");
    formData.append("decidedBy", editDecidedBy);
    formData.append("winnerTeam", editWinnerTeam);

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
    formData.append("stage", resultStage);
    formData.append("isKnockout", resultIsKnockout ? "true" : "false");
    formData.append("decidedBy", resultDecidedBy);
    formData.append("winnerTeam", resultWinnerTeam);
    formData.append("penaltyScoreA", resultPenaltyScoreA);
    formData.append("penaltyScoreB", resultPenaltyScoreB);

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
    setKnockoutSummary(null);
    setReconcileResult(null);

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
    setKnockoutSummary(null);
    setReconcileResult(null);

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

  const handleKnockoutSync = async () => {
    setActionError(null);
    setActionSuccess(null);
    setSyncError(null);
    setSyncSummary(null);
    setKnockoutSummary(null);
    setReconcileResult(null);

    startSyncTransition(async () => {
      try {
        const res = await syncKnockoutFixturesWithApi();
        if (res.success) {
          setActionSuccess("Knockout fixtures synchronized successfully!");
          setKnockoutSummary(res.summary);
        } else {
          setSyncError(res.error || "Failed to synchronize knockout fixtures.");
        }
      } catch (err: any) {
        setSyncError("An unexpected error occurred while running the sync. Please try again.");
      }
    });
  };

  const [fotmobRawJson, setFotmobRawJson] = useState("");
  const [configStatus, setConfigStatus] = useState<{ baseUrlPresent: boolean; apiKeyPresent: boolean; leagueIdPresent: boolean } | null>(null);

  useEffect(() => {
    getFotmobConfigStatus().then(setConfigStatus).catch(console.error);
  }, []);

  const handleReconcile = async (provider: string, apply: boolean) => {
    setActionError(null);
    setActionSuccess(null);
    setSyncError(null);
    setSyncSummary(null);
    setKnockoutSummary(null);
    setReconcileResult(null);

    startSyncTransition(async () => {
      try {
        const res = await reconcileFixtures(provider, apply, provider === "fotmob" ? fotmobRawJson : undefined);
        if (res.success) {
          setActionSuccess(apply ? "Safe fixture updates applied successfully!" : "Fixture audit completed! Review the comparison below.");
          setReconcileResult(res);
        } else {
          setSyncError(res.error || "Failed to run fixture reconciliation.");
        }
      } catch (err: any) {
        setSyncError("An unexpected error occurred while running reconciliation. Please try again.");
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Match Stage</label>
                    <select
                      name="stage"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      <option value="GROUP">Group Stage</option>
                      <option value="ROUND_OF_16">Round of 16</option>
                      <option value="QUARTER_FINAL">Quarter-Final</option>
                      <option value="SEMI_FINAL">Semi-Final</option>
                      <option value="THIRD_PLACE">Third Place</option>
                      <option value="FINAL">Final</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Knockout?</label>
                    <select
                      name="isKnockout"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      <option value="false">No (Group)</option>
                      <option value="true">Yes (Knockout)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Decided By</label>
                    <select
                      name="decidedBy"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      <option value="NORMAL_TIME">Normal Time</option>
                      <option value="EXTRA_TIME">Extra Time</option>
                      <option value="PENALTIES">Penalties</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="VOID">Void</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Winner Team Name</label>
                    <input
                      name="winnerTeam"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. France"
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

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Match Stage</label>
                            <select
                              value={editStage}
                              onChange={(e) => setEditStage(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
                            >
                              <option value="GROUP">Group Stage</option>
                              <option value="ROUND_OF_16">Round of 16</option>
                              <option value="QUARTER_FINAL">Quarter-Final</option>
                              <option value="SEMI_FINAL">Semi-Final</option>
                              <option value="THIRD_PLACE">Third Place</option>
                              <option value="FINAL">Final</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Knockout?</label>
                            <select
                              value={editIsKnockout ? "true" : "false"}
                              onChange={(e) => setEditIsKnockout(e.target.value === "true")}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
                            >
                              <option value="false">No (Group)</option>
                              <option value="true">Yes (Knockout)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Decided By</label>
                            <select
                              value={editDecidedBy}
                              onChange={(e) => setEditDecidedBy(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
                            >
                              <option value="NORMAL_TIME">Normal Time</option>
                              <option value="EXTRA_TIME">Extra Time</option>
                              <option value="PENALTIES">Penalties</option>
                              <option value="CANCELLED">Cancelled</option>
                              <option value="VOID">Void</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1">Winner Team Name</label>
                            <input
                              value={editWinnerTeam}
                              onChange={(e) => setEditWinnerTeam(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                              placeholder="e.g. France"
                            />
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm mx-auto">
                          <div>
                            <label className="block text-xs text-slate-450 mb-1.5 font-semibold">Match Stage</label>
                            <select
                              value={resultStage}
                              onChange={(e) => setResultStage(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 font-bold"
                            >
                              <option value="GROUP">Group Stage</option>
                              <option value="ROUND_OF_16">Round of 16</option>
                              <option value="QUARTER_FINAL">Quarter-Final</option>
                              <option value="SEMI_FINAL">Semi-Final</option>
                              <option value="THIRD_PLACE">Third Place</option>
                              <option value="FINAL">Final</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1.5 font-semibold">Knockout?</label>
                            <select
                              value={resultIsKnockout ? "true" : "false"}
                              onChange={(e) => setResultIsKnockout(e.target.value === "true")}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 font-bold"
                            >
                              <option value="false">No (Group)</option>
                              <option value="true">Yes (Knockout)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1.5 font-semibold">Decided By</label>
                            <select
                              value={resultDecidedBy}
                              onChange={(e) => setResultDecidedBy(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 font-bold"
                            >
                              <option value="NORMAL_TIME">Normal Time</option>
                              <option value="EXTRA_TIME">Extra Time</option>
                              <option value="PENALTIES">Penalties</option>
                              <option value="CANCELLED">Cancelled</option>
                              <option value="VOID">Void</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-450 mb-1.5 font-semibold">Winner/Advancing Team</label>
                            <select
                              value={resultWinnerTeam || ""}
                              onChange={(e) => setResultWinnerTeam(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 font-bold"
                            >
                              <option value="">No winner (Draw/N/A)</option>
                              <option value={match.teamA}>{match.teamA}</option>
                              <option value={match.teamB}>{match.teamB}</option>
                            </select>
                          </div>
                        </div>

                        {resultIsKnockout && resultDecidedBy === "PENALTIES" && (
                          <div className="bg-slate-950 p-4 border border-slate-850 rounded-2xl max-w-sm mx-auto space-y-3">
                            <h5 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center">
                              Penalty Shootout Result
                            </h5>
                            <div className="flex items-center space-x-4 justify-center">
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] text-slate-450 mb-1 font-bold">{match.teamA} Penalties</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={resultPenaltyScoreA}
                                  onChange={(e) => {
                                    setResultPenaltyScoreA(e.target.value);
                                    const pA = parseInt(e.target.value);
                                    const pB = parseInt(resultPenaltyScoreB);
                                    if (!isNaN(pA) && !isNaN(pB) && pA !== pB) {
                                      setResultWinnerTeam(pA > pB ? match.teamA : match.teamB);
                                    }
                                  }}
                                  required={resultStatus === "COMPLETED"}
                                  className="w-14 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                              <span className="font-extrabold text-slate-600 mt-5">-</span>
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] text-slate-450 mb-1 font-bold">{match.teamB} Penalties</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={resultPenaltyScoreB}
                                  onChange={(e) => {
                                    setResultPenaltyScoreB(e.target.value);
                                    const pA = parseInt(resultPenaltyScoreA);
                                    const pB = parseInt(e.target.value);
                                    if (!isNaN(pA) && !isNaN(pB) && pA !== pB) {
                                      setResultWinnerTeam(pA > pB ? match.teamA : match.teamB);
                                    }
                                  }}
                                  required={resultStatus === "COMPLETED"}
                                  className="w-14 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}

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
        <div className="space-y-6 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Card 1: API Synchronization */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Activity className="h-5 w-5" />
                  <h3 className="text-md font-bold text-slate-200">World Cup API Sync</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Manual sync only. Automatic sync is disabled to reduce database usage. Completed matches will trigger points calculation automatically.
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
                      <span>Last manual sync: {new Date(latest).toLocaleString()}</span>
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

            {/* Card 2: Update Knockout Fixtures */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Settings className="h-5 w-5" />
                  <h3 className="text-md font-bold text-slate-200">Knockout Placeholder Sync</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Fetches qualified teams for knockout stage placeholder matches (TBD) and replaces placeholders with actual qualified teams.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleKnockoutSync}
                  disabled={isSyncPending || isActionPending}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs cursor-pointer transition-all active:scale-95 w-full justify-center"
                >
                  <Settings className={`h-4 w-4 ${isSyncPending ? "animate-pulse" : ""}`} />
                  <span>{isSyncPending ? "Updating placeholders..." : "Update Knockout Fixtures"}</span>
                </button>
              </div>
            </div>

            {/* Card 3: Fixture Reconciliation */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <CheckSquare className="h-5 w-5" />
                  <h3 className="text-md font-bold text-slate-200">Fixture Reconciliation</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Audit and update matches by comparing with the provider database. Safely handles TBDs, placeholders, and schedule changes.
                </p>
              </div>
              <div className="pt-2 flex flex-col space-y-2.5">
                {/* Provider Selector */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Select Provider</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-200 outline-none focus:border-emerald-500"
                  >
                    <option value="worldcup">Current Provider (worldcup26.ir)</option>
                    <option value="apifootball">API-Football</option>
                    <option value="thestatsapi">TheStatsAPI</option>
                    <option value="kickoffapi">KickoffAPI</option>
                    <option value="fotmob">FotMob</option>
                    <option value="all">All Providers (Audit Mode)</option>
                  </select>
                </div>

                {selectedProvider === "fotmob" && (
                  <div className="space-y-2.5">
                    {/* FotMob Configuration Status block */}
                    <div className="space-y-1.5 p-3 bg-slate-950 border border-slate-850 rounded-xl">
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">FotMob Integration Status</span>
                      <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-350">
                        <div className="flex items-center space-x-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${configStatus?.baseUrlPresent ? "bg-emerald-500" : "bg-red-400 animate-pulse"}`} />
                          <span>FOTMOB_BASE_URL: {configStatus?.baseUrlPresent ? "configured" : "missing"}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${configStatus?.apiKeyPresent ? "bg-emerald-500" : "bg-slate-600"}`} />
                          <span>FOTMOB_API_KEY: {configStatus?.apiKeyPresent ? "configured" : "missing"}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${configStatus?.leagueIdPresent ? "bg-emerald-500" : "bg-slate-600"}`} />
                          <span>FOTMOB_LEAGUE_ID: {configStatus?.leagueIdPresent ? "configured" : "missing"}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>Manual JSON mode available: yes</span>
                        </div>
                      </div>
                      {!configStatus?.baseUrlPresent && (
                        <p className="text-[8.5px] text-amber-400 italic leading-relaxed mt-1">
                          FotMob provider is not configured. Configure FOTMOB_BASE_URL or use Manual JSON Import mode below.
                        </p>
                      )}
                    </div>

                    {/* Manual JSON textarea */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Paste raw FotMob fixture JSON</label>
                      <textarea
                        value={fotmobRawJson}
                        onChange={(e) => setFotmobRawJson(e.target.value)}
                        placeholder="Paste raw FotMob API response JSON here to run reconciliation offline/fallback..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-[10px] text-slate-350 outline-none focus:border-emerald-500 h-16 font-mono resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Audit Buttons Row */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleReconcile(selectedProvider, false)}
                    disabled={isSyncPending || isActionPending}
                    className="flex items-center px-1.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-50 font-bold text-[9px] cursor-pointer transition-all active:scale-95 justify-center"
                    title="Fetch raw provider fixtures"
                  >
                    <span>Fetch Provider Fixtures</span>
                  </button>
                  <button
                    onClick={() => handleReconcile(selectedProvider, false)}
                    disabled={isSyncPending || isActionPending}
                    className="flex items-center px-1.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-50 font-bold text-[9px] cursor-pointer transition-all active:scale-95 justify-center"
                    title="Run difference audit"
                  >
                    <span>Run Fixture Audit</span>
                  </button>
                  <button
                    onClick={() => handleReconcile(selectedProvider, false)}
                    disabled={isSyncPending || isActionPending}
                    className="flex items-center px-1.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-50 font-bold text-[9px] cursor-pointer transition-all active:scale-95 justify-center"
                    title="Compile full fixture list"
                  >
                    <span>Compile Full Fixture List</span>
                  </button>
                </div>

                {/* Apply Button */}
                <button
                  onClick={() => handleReconcile(selectedProvider, true)}
                  disabled={isSyncPending || isActionPending}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs cursor-pointer transition-all active:scale-95 w-full justify-center"
                  title="Apply safe fixture updates"
                >
                  <CheckSquare className="h-4 w-4" />
                  <span>Apply Safe Fixture Updates</span>
                </button>
              </div>
            </div>

            {/* Card 4: Points Recalculation */}
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

          {/* Knockout Sync Results Display */}
          {knockoutSummary && (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-slate-850 pb-2">
                Knockout Fixture Sync Report
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Total Fetched</span>
                    <span className="text-lg font-black text-slate-100">{knockoutSummary.totalFetched}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Matched</span>
                    <span className="text-lg font-black text-emerald-450">{knockoutSummary.matched}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Updated</span>
                    <span className="text-lg font-black text-emerald-450">{knockoutSummary.updated}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Skipped TBD</span>
                    <span className="text-lg font-black text-slate-400">{knockoutSummary.skippedTbd}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Ambiguous Skipped</span>
                    <span className="text-lg font-black text-amber-500">{knockoutSummary.skippedAmbiguous}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Already Confirmed</span>
                    <span className="text-lg font-black text-slate-400">{knockoutSummary.skippedAlreadyReal}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">No Placeholder</span>
                    <span className="text-lg font-black text-amber-500">{knockoutSummary.skippedNoPlaceholder}</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Prediction Warnings</span>
                    <span className={`text-lg font-black ${knockoutSummary.duplicateRisks > 0 ? "text-amber-500 font-black animate-pulse" : "text-slate-400"}`}>{knockoutSummary.duplicateRisks}</span>
                  </div>
                </div>

                {knockoutSummary.skippedDetails && knockoutSummary.skippedDetails.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Fixture Processing Details</span>
                    <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1 max-h-40 overflow-y-auto">
                      {knockoutSummary.skippedDetails.map((item: any, idx: number) => (
                        <div key={idx} className="text-[11px] text-slate-450 flex justify-between py-0.5 border-b border-slate-900 last:border-0">
                          <span className="font-semibold text-slate-300">{item.matchName}</span>
                          <span className="text-amber-500 text-[10px] font-bold">{item.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {knockoutSummary.errors && knockoutSummary.errors.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Processing Errors</span>
                    <div className="p-3.5 bg-red-500/5 border border-red-500/10 rounded-xl space-y-1 max-h-40 overflow-y-auto">
                      {knockoutSummary.errors.map((err: string, idx: number) => (
                        <div key={idx} className="text-[11px] text-red-400 flex items-start space-x-1">
                          <span className="text-red-500 font-bold mr-1">•</span>
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reconcile Results Display */}
          {reconcileResult && (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4 max-w-4xl overflow-hidden">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider border-b border-slate-850 pb-2">
                Fixture Reconciliation Report ({reconcileResult.summary.updatesApplied} Applied / {reconcileResult.summary.safeUpdatesIdentified} Safe Updates Identified)
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pb-2 text-[10px]">
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Scanned (Local)</span>
                  <span className="text-lg font-black text-slate-100 mt-0.5">{reconcileResult.summary.totalLocalScanned}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Imported (API)</span>
                  <span className="text-lg font-black text-slate-100 mt-0.5">{reconcileResult.summary.totalApiFixtures}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Local Placeholders</span>
                  <span className="text-lg font-black text-slate-100 mt-0.5">{reconcileResult.summary.placeholdersFound}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Provider Placeholders</span>
                  <span className="text-lg font-black text-slate-100 mt-0.5">{reconcileResult.summary.providerPlaceholders}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Matched Existing</span>
                  <span className="text-lg font-black text-slate-100 mt-0.5">{reconcileResult.summary.matchedExisting}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Safe Updates</span>
                  <span className="text-lg font-black text-emerald-450 mt-0.5">{reconcileResult.summary.safeUpdatesIdentified}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Missing Local</span>
                  <span className="text-lg font-black text-blue-400 mt-0.5">{reconcileResult.summary.missingLocal}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Insert Candidates</span>
                  <span className="text-lg font-black text-emerald-450 mt-0.5">{reconcileResult.summary.insertCandidates}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Conflicts</span>
                  <span className={`text-lg font-black mt-0.5 ${reconcileResult.summary.providerConflicts > 0 ? "text-red-400 animate-pulse" : "text-slate-450"}`}>
                    {reconcileResult.summary.providerConflicts}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Ambiguous Skipped</span>
                  <span className="text-lg font-black text-amber-500 mt-0.5">{reconcileResult.summary.ambiguousSkipped}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Risky/Duplicates</span>
                  <span className="text-lg font-black text-red-400 mt-0.5">{reconcileResult.summary.riskySkipped}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col">
                  <span className="text-slate-500 font-bold uppercase">Applied Updates</span>
                  <span className="text-lg font-black text-emerald-450 mt-0.5">{reconcileResult.summary.updatesApplied}</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[450px] border border-slate-850 rounded-xl">
                <table className="w-full text-[11px] text-slate-350 border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-left font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                      <th className="py-2.5 px-3">Local vs Proposed Match</th>
                      <th className="py-2.5 px-3">Stage (Current vs Prop)</th>
                      <th className="py-2.5 px-3">Kickoff (Current vs Prop)</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3 text-center">Confidence</th>
                      <th className="py-2.5 px-3 text-center">Action/Status</th>
                      <th className="py-2.5 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {reconcileResult.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-950/40">
                        <td className="py-2 px-3">
                          <div className="flex flex-col">
                            {item.currentTeamA ? (
                              <span className="font-bold text-slate-200">{item.currentTeamA} vs {item.currentTeamB}</span>
                            ) : (
                              <span className="italic text-slate-500">Not Found (Local)</span>
                            )}
                            {item.proposedTeamA && (item.proposedTeamA !== item.currentTeamA || item.proposedTeamB !== item.currentTeamB) && (
                              <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                                → {item.proposedTeamA} vs {item.proposedTeamB}
                              </span>
                            )}
                            {item.localId && <span className="block text-[8px] text-slate-550 font-mono mt-0.5">Local ID: {item.localId}</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col">
                            <span className="text-slate-400 font-medium">{item.currentStage || "—"}</span>
                            {item.stageChanged && (
                              <span className="text-[10px] text-emerald-450 font-bold mt-0.5">
                                → {item.proposedStage} {item.proposedIsKnockout ? "(KO)" : "(Group)"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px]">
                          <div className="flex flex-col">
                            <span className="text-slate-450">{item.currentKickoff ? new Date(item.currentKickoff).toLocaleString() : "—"}</span>
                            {item.proposedKickoff && item.proposedKickoff !== item.currentKickoff && (
                              <span className="text-emerald-400 font-semibold mt-0.5">
                                → {new Date(item.proposedKickoff).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col text-[10px]">
                            <span className="text-slate-300 capitalize font-bold">{item.provider}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">{item.confidence}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                            item.action === "SAFE_UPDATE_EXISTING" ? (reconcileResult.summary.updatesApplied > 0 ? "bg-emerald-500 text-slate-950" : "bg-emerald-500/20 text-emerald-450 border border-emerald-500/30") :
                            item.action === "MATCHED_EXISTING" ? "bg-slate-800 text-slate-400 border border-slate-700/60" :
                            item.action === "MISSING_LOCAL_FIXTURE" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                            item.action === "POSSIBLE_DUPLICATE" ? "bg-amber-500/20 text-amber-405 border border-amber-500/30" :
                            item.action === "AMBIGUOUS_MATCH" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                            item.action === "PROVIDER_CONFLICT" ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse" :
                            item.action === "PROVIDER_STILL_TBD" ? "bg-slate-850 text-slate-550 border border-slate-800" :
                            "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse" // RISKY_MANUAL_REVIEW
                          }`}>
                            {item.action === "SAFE_UPDATE_EXISTING" && reconcileResult.summary.updatesApplied > 0 ? "APPLIED" : 
                             item.action === "MISSING_LOCAL_FIXTURE" && reconcileResult.summary.updatesApplied > 0 ? "INSERTED" : 
                             item.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400" title={item.reason}>
                          {item.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
