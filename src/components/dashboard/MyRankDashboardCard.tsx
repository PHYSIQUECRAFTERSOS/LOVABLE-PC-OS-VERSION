import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMyRank } from "@/hooks/useRanked";
import { useXPAward } from "@/hooks/useXPAward";
import TierBadge from "@/components/ranked/TierBadge";
import { getDivisionLabel, calculateTierAndDivision, getTierColor } from "@/utils/rankedXP";
import { ChevronRight, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MyRankDashboardCard = () => {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useMyRank();
  const { dashboardXPGain, clearDashboardXP } = useXPAward();

  // Animation states
  const [animatingXP, setAnimatingXP] = useState<{ amount: number; id: string } | null>(null);
  const [chipPhase, setChipPhase] = useState<"enter" | "fly" | "done">("done");
  const [displayProgress, setDisplayProgress] = useState<number | null>(null);
  const [barFlash, setBarFlash] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!profile) return null;

  const label = getDivisionLabel(profile.current_tier, profile.current_division);
  const { divisionXP, xpNeeded } = calculateTierAndDivision(profile.total_xp);
  const isChampion = profile.current_tier === "champion";
  const xpToNext = isChampion ? 0 : xpNeeded - divisionXP;
  const progressPct = isChampion ? 100 : xpNeeded > 0 ? (divisionXP / xpNeeded) * 100 : 0;
  const tierColor = getTierColor(profile.current_tier);
  const streak = profile.current_streak || 0;
  const nearRankUp = !isChampion && xpToNext > 0 && xpToNext <= 10;

  // Handle XP gain animation
  useEffect(() => {
    if (!dashboardXPGain) return;

    const gain = dashboardXPGain;
    clearDashboardXP();

    // Set old progress as starting point for bar animation
    const oldDivXP = Math.max(0, divisionXP - gain.amount);
    const oldPct = xpNeeded > 0 ? (oldDivXP / xpNeeded) * 100 : 0;
    setDisplayProgress(isChampion ? 100 : oldPct);

    setAnimatingXP(gain);
    setChipPhase("enter");

    // Chip fly phase
    const t1 = setTimeout(() => setChipPhase("fly"), 200);

    // Bar fill phase
    const t2 = setTimeout(() => {
      setChipPhase("done");
      setDisplayProgress(null); // snap to real progress
      // Flash if we crossed 100%
      if (divisionXP < gain.amount && !isChampion) {
        setBarFlash(true);
        setTimeout(() => setBarFlash(false), 600);
      }
    }, 700);

    const t3 = setTimeout(() => setAnimatingXP(null), 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [dashboardXPGain]);

  const barWidth = displayProgress !== null ? displayProgress : progressPct;

  return (
    <div className="relative">
      {/* XP Chip Animation */}
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
          nearRankUp ? "animate-[glow-pulse_2s_ease-in-out_infinite]" : "border-primary/30"
        }`}
        style={
          nearRankUp
            ? ({
                "--glow-color": tierColor,
                borderColor: tierColor,
              } as React.CSSProperties)
            : undefined
        }
      >
        {/* Badge */}
        <div className="h-14 w-14 shrink-0 flex items-center justify-center overflow-hidden">
          <TierBadge tier={profile.current_tier} size={80} />
        </div>

        {/* Info + Bar */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Top row: label + streak + chevron */}
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-foreground truncate">{label}</p>
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-400 shrink-0">
                <Flame className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />
                {streak}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  barFlash ? "brightness-150" : ""
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, barWidth))}%`,
                  backgroundColor: tierColor,
                  transition: displayProgress !== null ? "none" : "width 500ms ease-out",
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isChampion
                ? "Top rank achieved"
                : `${divisionXP} / ${xpNeeded} XP`}
            </p>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    </div>
  );
};

export default MyRankDashboardCard;
