import { cn } from "@/lib/utils";

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

const MacroRing = ({ label, current, target, color, unit = "g" }: MacroRingProps) => {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className="relative h-[72px] w-[72px] sm:h-20 sm:w-20">
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
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs sm:text-sm font-bold text-foreground">{current}</span>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">/ {target}</span>
        </div>
      </div>
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
};

export default MacroRing;
