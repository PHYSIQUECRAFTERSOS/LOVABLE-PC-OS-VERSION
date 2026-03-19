import { useNavigate } from "react-router-dom";
import { useMyRank } from "@/hooks/useRanked";
import TierBadge from "@/components/ranked/TierBadge";
import { getDivisionLabel, calculateTierAndDivision } from "@/utils/rankedXP";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MyRankDashboardCard = () => {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useMyRank();

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;
  if (!profile) return null;

  const label = getDivisionLabel(
    profile.current_tier,
    profile.current_division
  );
  const { divisionXP, xpNeeded } = calculateTierAndDivision(profile.total_xp);
  const xpToNext =
    profile.current_tier === "champion" ? 0 : xpNeeded - divisionXP;

  return (
    <button
      onClick={() => navigate("/ranked")}
      className="w-full flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 sm:px-4 py-3 text-left transition-colors hover:bg-primary/5 overflow-hidden"
    >
      <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 flex items-center justify-center overflow-hidden">
        <TierBadge tier={profile.current_tier} size={100} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {xpToNext > 0 ? `${xpToNext} XP to next` : "Top rank achieved"}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
};

export default MyRankDashboardCard;
