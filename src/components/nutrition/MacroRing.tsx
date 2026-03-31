import { cn } from "@/lib/utils";

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

const MacroRing = ({ label, current, target, color, unit = "g" }: MacroRingProps) => {
  const rawPercentage = target > 0 ? (current / target) * 100 : 0;
  const percentage = Math.min(rawPercentage, 100);
  const isOver = rawPercentage > 100;
  const isWayOver = rawPercentage > 110;
  const overAmount = Math.round(current - target);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color shifts for over-target
  const ringColor = isWayOver
    ? "hsl(0 70% 50%)"
    : isOver
      ? "hsl(15 80% 50%)"
      : color;

  return (
    <div className="flex flex-col items-center gap-1 min-w-0 w-full">
      <div className="relative w-full aspect-square max-w-[80px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="6"
          />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn(
              "transition-all duration-500",
              isOver && "drop-shadow-[0_0_6px_hsl(0_70%_50%/0.5)]"
            )}
            style={isWayOver ? { filter: "drop-shadow(0 0 8px hsl(0 70% 50% / 0.6))" } : undefined}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(
            "text-xs sm:text-sm font-bold",
            isOver ? "text-destructive" : "text-foreground"
          )}>
            {Math.round(current)}
          </span>
          {isOver ? (
            <span className="text-[8px] sm:text-[9px] font-semibold text-destructive leading-tight">
              +{overAmount} over
            </span>
          ) : (
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">
              / {Math.round(target)}
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate max-w-full">{label}</span>
    </div>
  );
};

export default MacroRing;
