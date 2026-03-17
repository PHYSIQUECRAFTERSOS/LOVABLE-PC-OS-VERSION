import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import MyRankCard from "@/components/ranked/MyRankCard";
import RankedLeaderboard from "@/components/ranked/RankedLeaderboard";
import XPHistoryFeed from "@/components/ranked/XPHistoryFeed";
import BadgeCollection from "@/components/ranked/BadgeCollection";
import XPManager from "@/components/ranked/XPManager";
import { useMyRank } from "@/hooks/useRanked";
import HowRankedWorksModal from "@/components/ranked/HowRankedWorksModal";
import { useState } from "react";
import { cn } from "@/lib/utils";

const Ranked = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const [coachTab, setCoachTab] = useState<"leaderboard" | "xp_manager">(
    "leaderboard"
  );
  const { data: myRank } = useMyRank();

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Physique Crafters Ranked
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compete. Climb. Challenge yourself.
            </p>
          </div>
          <HowRankedWorksModal />
        </div>

        {isCoach ? (
          <>
            <div className="flex gap-2">
              {(["leaderboard", "xp_manager"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCoachTab(t)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                    coachTab === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "leaderboard" ? "Leaderboard" : "XP Manager"}
                </button>
              ))}
            </div>

            {coachTab === "leaderboard" && <RankedLeaderboard />}
            {coachTab === "xp_manager" && <XPManager />}
          </>
        ) : (
          <>
            <MyRankCard profile={myRank} />
            <RankedLeaderboard />
            <XPHistoryFeed />
            <BadgeCollection />
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Ranked;
