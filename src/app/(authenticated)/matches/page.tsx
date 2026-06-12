import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MatchesList from "@/components/MatchesList";
import RealTimePoll from "@/components/RealTimePoll";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ predict?: string }>;
}

export default async function MatchesPage({ searchParams }: PageProps) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  const params = await searchParams;
  const predictId = params.predict;

  // 1. Fetch matches with all predictions and the associated user names
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

  const now = new Date();

  // 2. Format matches securely on the server side
  const formattedMatches = matches.map((match) => {
    const isLocked = now >= new Date(match.predictionDeadline) || match.status !== "UPCOMING";

    // User's own prediction
    const userPrediction = match.predictions.find(
      (p) => p.userId === sessionUser.userId
    );

    // Filter predictions to only send allowed predictions to the client
    const allowedPredictions = match.predictions.filter((p) => {
      // Current user can always see their own prediction
      if (p.userId === sessionUser.userId) return true;
      // Show others' predictions only if the match is locked or completed
      return isLocked;
    });

    // Map into required structure
    return {
      id: match.id,
      teamA: match.teamA,
      teamB: match.teamB,
      matchTime: match.matchTime.toISOString(),
      predictionDeadline: match.predictionDeadline.toISOString(),
      status: match.status,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      result: match.result,
      isLocked,
      officialMatchUrl: match.officialMatchUrl,
      officialBroadcasterUrl: match.officialBroadcasterUrl,
      liveCoverageUrl: match.liveCoverageUrl,
      broadcasterName: match.broadcasterName,
      streamSourceType: match.streamSourceType,
      lastSyncedAt: match.lastSyncedAt ? match.lastSyncedAt.toISOString() : null,
      userPrediction: userPrediction
        ? {
            id: userPrediction.id,
            userId: userPrediction.userId,
            matchId: userPrediction.matchId,
            predictedResult: userPrediction.predictedResult,
            predictedTeamAScore: userPrediction.predictedTeamAScore,
            predictedTeamBScore: userPrediction.predictedTeamBScore,
            pointsAwarded: userPrediction.pointsAwarded,
            predictionResult: userPrediction.predictionResult,
            user: { name: userPrediction.user.name },
          }
        : null,
      predictions: allowedPredictions.map((p) => ({
        id: p.id,
        userId: p.userId,
        matchId: p.matchId,
        predictedResult: p.predictedResult,
        predictedTeamAScore: p.predictedTeamAScore,
        predictedTeamBScore: p.predictedTeamBScore,
        pointsAwarded: p.pointsAwarded,
        predictionResult: p.predictionResult,
        user: { name: p.user.name },
      })),
    };
  });

  return (
    <div className="space-y-6">
      <RealTimePoll />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          World Cup Matches
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Submit outcome and score predictions to earn points. Predictions lock at the match deadline.
        </p>
      </div>

      <MatchesList 
        initialMatches={formattedMatches} 
        currentUserId={sessionUser.userId} 
        searchParamsPredictId={predictId} 
      />
    </div>
  );
}
