import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMyRank } from "@/hooks/useRanked";
import { useXPAward } from "@/hooks/useXPAward";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TierBadge from "@/components/ranked/TierBadge";
import PlacementTracker from "@/components/ranked/PlacementTracker";
import ConfettiBurst from "@/components/workout/ConfettiBurst";
import { getDivisionLabel, calculateTierAndDivision, getTierColor } from "@/utils/rankedXP";
import { ChevronRight, Flame, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const db = supabase as any;

function useTodayXP(userId?: string) {
  return useQuery({
    queryKey: ["xp-today", userId],
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const { data } = await db
        .from("xp_transactions")
        .select("xp_amount")
        .eq("user_id", userId)
        .gte("created_at", startOfDay)
        .gt("xp_amount", 0);
      return (data || []).reduce((sum: number, r: any) => sum + (r.xp_amount || 0), 0);
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

const MyRankDashboardCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile, isLoading } = useMyRank();
  const { dashboardXPGain, clearDashboardXP } = useXPAward();
  const { data: todayXP = 0 } = useTodayXP(user?.id);

  const [animatingXP, setAnimatingXP] = useState<{ amount: number; id: string } | null>(null);
  const [chipPhase, setChipPhase] = useState<"enter" | "fly" | "done">("done");
  const [displayProgress, setDisplayProgress] = useState<number | null>(null);
  const [barFlash, setBarFlash] = useState(false);
  const [fireConfetti, setFireConfetti] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);

  const placementStatus = profile?.placement_status || "completed";
  const isInPlacement = placementStatus === "pending" || placementStatus === "in_progress";

  const label = profile ? getDivisionLabel(profile.current_tier, profile.current_division) : "";
  const calc = profile ? calculateTierAndDivision(profile.total_xp) : { divisionXP: 0, xpNeeded: 0 };
  const divisionXP = calc.divisionXP;
  const xpNeeded = calc.xpNeeded;
  const isChampion = profile?.current_tier === "champion";
  const xpToNext = isChampion ? 0 : xpNeeded - divisionXP;
  const progressPct = isChampion ? 100 : xpNeeded > 0 ? (divisionXP / xpNeeded) * 100 : 0;
  const tierColor = profile ? getTierColor(profile.current_tier) : "#CD7F32";
  const streak = profile?.current_streak || 0;
  const nearRankUp = !isChampion && !isInPlacement && xpToNext > 0 && xpToNext <= 10;
  const position = profile?.position || 0;
  const totalPlayers = profile?.totalPlayers || 0;

  useEffect(() => {
    if (!dashboardXPGain || !profile || isInPlacement) return;

    const gain = dashboardXPGain;
    clearDashboardXP();

    const oldDivXP = Math.max(0, divisionXP - gain.amount);
    const oldPct = xpNeeded > 0 ? (oldDivXP / xpNeeded) * 100 : 0;
    setDisplayProgress(isChampion ? 100 : oldPct);

    setAnimatingXP(gain);
    setChipPhase("enter");

    const t1 = setTimeout(() => setChipPhase("fly"), 200);
    const t2 = setTimeout(() => {
      setChipPhase("done");
      setDisplayProgress(null);
      if (progressPct >= 100 || (divisionXP < gain.amount && !isChampion)) {
        setFireConfetti(true);
        setBarFlash(true);
        setTimeout(() => setBarFlash(false), 600);
        setTimeout(() => setFireConfetti(false), 1500);
      }
    }, 700);
    const t3 = setTimeout(() => setAnimatingXP(null), 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      setAnimatingXP(null);
      setChipPhase("done");
      setDisplayProgress(null);
    };
  }, [dashboardXPGain]);

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!profile) return null;

  // Placement mode: show compact placement tracker
  if (isInPlacement) {
    return (
      <button
        onClick={() => navigate("/ranked")}
        className="w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-3 py-3 text-left transition-all hover:bg-primary/5 overflow-hidden"
      >
        <div className="flex-1 min-w-0">
          <PlacementTracker
            daysCompleted={profile.placement_days_completed || 0}
            status={placementStatus}
            compact
          />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  const barWidth = displayProgress !== null ? displayProgress : progressPct;

  return (
    <div className="relative">
      <ConfettiBurst fire={fireConfetti} />

      {animatingXP && chipPhase !== "done" && (
        <div
          className={`fixed left-1/2 z-50 pointer-events-none font-bold text-sm rounded-full px-3 py-1 shadow-lg transition-all ${
            chipPhase === "enter"
              ? "opacity-100 scale-110 -translate-x-1/2"
              : "opacity-0 scale-75 -translate-x-1/2 -translate-y-20"
          }`}
          style={{
            top: chipPhase === "enter" ? "45%" : "25%",
            transitionDuration: chipPhase === "fly" ? "500ms" : "200ms",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            backgroundColor: tierColor,
            color: "#000",
          }}
        >
          +{animatingXP.amount} XP
        </div>
      )}

      <button
        ref={cardRef}
        onClick={() => navigate("/ranked")}
        className={`w-full flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-all hover:bg-primary/5 overflow-hidden ${
          nearRankUp ? "" : "border-primary/30"
        }`}
        style={
          nearRankUp
            ? {
                borderColor: tierColor,
                boxShadow: `0 0 12px ${tierColor}44, 0 0 4px ${tierColor}22`,
                animation: "glow-pulse 2s ease-in-out infinite",
              }
            : undefined
        }
      >
        <div className="h-28 w-28 shrink-0 flex items-center justify-center overflow-hidden">
          <TierBadge tier={profile.current_tier} size={160} />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-foreground truncate">{label}</p>
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold shrink-0" style={{ color: "#fb923c" }}>
                <Flame className="h-3.5 w-3.5" style={{ fill: "#fb923c", color: "#fb923c" }} />
                {streak}
              </span>
            )}
            {todayXP > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                +{todayXP} today
              </span>
            )}
          </div>

          <div className="w-full">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className={`h-full rounded-full ${barFlash ? "brightness-150" : ""}`}
                style={{
                  width: `${Math.min(100, Math.max(0, barWidth))}%`,
                  backgroundColor: tierColor,
                  transition: displayProgress !== null ? "none" : "width 500ms ease-out",
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[10px] text-muted-foreground">
                {isChampion ? "Top rank achieved" : `${divisionXP} / ${xpNeeded} XP`}
              </p>
              {position > 0 && totalPlayers > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <TrendingUp className="h-2.5 w-2.5" />
                  #{position} of {totalPlayers}
                </span>
              )}
            </div>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 8px ${tierColor}33, 0 0 2px ${tierColor}22; }
          50% { box-shadow: 0 0 18px ${tierColor}66, 0 0 6px ${tierColor}44; }
        }
      `}</style>
    </div>
  );
};

export default MyRankDashboardCard;
