import { useState, useEffect } from "react";
import { PLACEMENT_DURATION_DAYS } from "@/utils/rankedXP";
import { HelpCircle, CheckCircle2, Circle } from "lucide-react";

interface PlacementTrackerProps {
  daysCompleted: number;
  status: string;
  compact?: boolean;
}

const PlacementTracker = ({ daysCompleted, status, compact = false }: PlacementTrackerProps) => {
  const total = PLACEMENT_DURATION_DAYS;
  const days = Math.min(daysCompleted, total);
  const isPending = status === "pending";
  const [animatedDay, setAnimatedDay] = useState(days);

  // Animate the latest completed day
  useEffect(() => {
    if (days > animatedDay) {
      const timer = setTimeout(() => setAnimatedDay(days), 300);
      return () => clearTimeout(timer);
    }
    setAnimatedDay(days);
  }, [days]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {/* Pulsing ? badge */}
        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center relative">
          <span
            className="text-lg font-black text-primary"
            style={{ animation: "placementPulse 2s ease-in-out infinite" }}
          >
            ?
          </span>
          <style>{`
            @keyframes placementPulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.15); opacity: 0.8; }
            }
          `}</style>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-primary">Placement Series</p>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="h-2 flex-1 rounded-full transition-all duration-500"
                style={{
                  backgroundColor: i < days
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                  boxShadow: i === days - 1 && days > 0
                    ? "0 0 6px hsl(var(--primary) / 0.6)"
                    : "none",
                  transitionDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {isPending ? "Starts tomorrow — get ready!" : `Day ${days} of ${total} complete`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5 space-y-5">
      <style>{`
        @keyframes questionPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px hsl(var(--primary) / 0.3)); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.6)); }
        }
        @keyframes dotComplete {
          0% { transform: scale(0.5); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes dotGlow {
          0%, 100% { box-shadow: 0 0 4px hsl(var(--primary) / 0.3); }
          50% { box-shadow: 0 0 12px hsl(var(--primary) / 0.6); }
        }
        @keyframes progressShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* ? Badge with pulsing glow */}
      <div className="flex justify-center">
        <div
          className="h-28 w-28 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border-2 border-primary/40"
          style={{ animation: "questionPulse 3s ease-in-out infinite" }}
        >
          <span className="text-5xl font-black text-primary">?</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground">Placement Series</h2>
        <p className="text-sm text-muted-foreground">
          {isPending
            ? "Your placement begins tomorrow. Stay consistent!"
            : `Day ${days} of ${total} — ${total - days} ${total - days === 1 ? "day" : "days"} remaining!`}
        </p>
      </div>

      {/* Progress dots with checkmarks */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => {
          const isComplete = i < days;
          const isLatest = i === days - 1 && days > 0;
          return (
            <div key={i} className="relative flex items-center justify-center">
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500"
                style={{
                  backgroundColor: isComplete
                    ? "hsl(var(--primary))"
                    : "hsl(var(--secondary))",
                  color: isComplete
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))",
                  animation: isLatest
                    ? "dotComplete 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), dotGlow 2s ease-in-out infinite"
                    : isComplete
                    ? "dotGlow 3s ease-in-out infinite"
                    : "none",
                  transitionDelay: `${i * 80}ms`,
                }}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4.5 w-4.5" />
                ) : (
                  i + 1
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
            style={{
              width: `${(days / total) * 100}%`,
              backgroundColor: "hsl(var(--primary))",
            }}
          >
            {/* Shimmer effect */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: days > 0 ? "progressShimmer 2s linear infinite" : "none",
              }}
            />
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {days === 0
            ? "Complete your first day to start climbing"
            : days >= total
            ? "Evaluating your performance..."
            : `${Math.round((days / total) * 100)}% complete`}
        </p>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
        <p className="text-xs font-semibold text-foreground">🎮 How it works</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Complete your workouts, hit your nutrition targets, and stay on top of cardio for {total} days.
          Your consistency score determines your starting rank — up to <span className="text-primary font-semibold">Gold III</span>.
          The more consistent you are, the higher you'll be placed!
        </p>
      </div>
    </div>
  );
};

export default PlacementTracker;
