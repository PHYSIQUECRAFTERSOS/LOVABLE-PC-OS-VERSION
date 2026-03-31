import { PLACEMENT_DURATION_DAYS } from "@/utils/rankedXP";
import { HelpCircle } from "lucide-react";

interface PlacementTrackerProps {
  daysCompleted: number;
  status: string;
  compact?: boolean;
}

const PlacementTracker = ({ daysCompleted, status, compact = false }: PlacementTrackerProps) => {
  const total = PLACEMENT_DURATION_DAYS;
  const days = Math.min(daysCompleted, total);
  const isPending = status === "pending";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
          <HelpCircle className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-primary">Placement Series</p>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full transition-all"
                style={{
                  backgroundColor: i < days
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {isPending ? "Starts tomorrow" : `Day ${days}/${total}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5 space-y-4">
      {/* ? Badge */}
      <div className="flex justify-center">
        <div className="h-28 w-28 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border-2 border-primary/40">
          <span className="text-5xl font-black text-primary">?</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground">Placement Series</h2>
        <p className="text-sm text-muted-foreground">
          {isPending
            ? "Your placement begins tomorrow. Stay consistent!"
            : `Day ${days} of ${total} — Keep going!`}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="relative flex items-center justify-center"
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                backgroundColor: i < days
                  ? "hsl(var(--primary))"
                  : "hsl(var(--secondary))",
                color: i < days
                  ? "hsl(var(--primary-foreground))"
                  : "hsl(var(--muted-foreground))",
                boxShadow: i < days ? "0 0 8px hsl(var(--primary) / 0.4)" : "none",
              }}
            >
              {i < days ? "✓" : i + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
        <p className="text-xs font-semibold text-foreground">How it works</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Complete your workouts, hit your nutrition targets, and stay on top of cardio for {total} days.
          Your compliance score determines your starting rank (up to Gold III).
        </p>
      </div>
    </div>
  );
};

export default PlacementTracker;
