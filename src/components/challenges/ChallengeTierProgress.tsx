import { ChallengeTier } from "@/hooks/useChallenges";
import { Progress } from "@/components/ui/progress";
import TierIcon from "./TierIcon";

interface Props {
  tiers: ChallengeTier[];
  currentPoints: number;
}

const ChallengeTierProgress = ({ tiers, currentPoints }: Props) => {
  if (!tiers.length) return null;

  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  const currentTier = [...sorted].reverse().find((t) => currentPoints >= t.min_points) || sorted[0];
  const currentIdx = sorted.findIndex((t) => t.name === currentTier.name);
  const nextTier = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

  const progressToNext = nextTier
    ? Math.min(100, Math.round(((currentPoints - currentTier.min_points) / (nextTier.min_points - currentTier.min_points)) * 100))
    : 100;

  return (
    <div className="space-y-3">
      {/* Current tier display */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-lg border-2"
          style={{ borderColor: currentTier.color, backgroundColor: `${currentTier.color}15` }}
        >
          <TierIcon name={currentTier.name} size={120} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: currentTier.color }}>
              {currentTier.name}
            </span>
            <span className="text-xs text-muted-foreground">{currentPoints} pts</span>
          </div>
          {nextTier && (
            <div className="space-y-1 mt-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Next: {nextTier.name}</span>
                <span>{nextTier.min_points - currentPoints} pts to go</span>
              </div>
              <Progress value={progressToNext} className="h-1.5" />
            </div>
          )}
          {!nextTier && (
            <p className="text-[10px] text-muted-foreground mt-0.5">👑 Maximum tier reached!</p>
          )}
        </div>
      </div>

      {/* Tier path visualization */}
      <div className="flex items-center gap-1">
        {sorted.map((tier, i) => {
          const isActive = currentPoints >= tier.min_points;
          const isCurrent = tier.name === currentTier.name;
          return (
            <div key={tier.id} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs border-2 transition-all ${
                    isCurrent ? "scale-110 shadow-lg" : ""
                  }`}
                  style={{
                    borderColor: isActive ? tier.color : "hsl(var(--border))",
                    backgroundColor: isActive ? `${tier.color}20` : "transparent",
                    opacity: isActive ? 1 : 0.4,
                  }}
                >
                  <TierIcon name={tier.name} size={18} />
                </div>
                <span
                  className="text-[9px] mt-1 font-medium"
                  style={{ color: isActive ? tier.color : "hsl(var(--muted-foreground))" }}
                >
                  {tier.name}
                </span>
                <span className="text-[8px] text-muted-foreground">{tier.min_points}+</span>
              </div>
              {i < sorted.length - 1 && (
                <div
                  className="h-0.5 flex-1 rounded-full min-w-2"
                  style={{
                    backgroundColor: currentPoints >= sorted[i + 1].min_points
                      ? sorted[i + 1].color
                      : "hsl(var(--border))",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChallengeTierProgress;
