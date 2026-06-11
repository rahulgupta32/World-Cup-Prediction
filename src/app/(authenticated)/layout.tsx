import { getSessionUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import Navbar from "@/components/Navbar";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  // Get current points and rank from leaderboard
  const leaderboard = await getLeaderboard();
  const userEntry = leaderboard.find((entry) => entry.userId === user.userId);

  const stats = {
    points: userEntry ? userEntry.totalPoints : 0,
    rank: userEntry ? userEntry.rank : leaderboard.length + 1,
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <Navbar user={user} stats={stats} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-slate-500 text-xs">
        <p>&copy; {new Date().getFullYear()} World Cup Prediction League. Built for working professionals.</p>
      </footer>
    </div>
  );
}
