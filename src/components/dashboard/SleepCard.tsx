import { Moon } from "lucide-react";
import { forwardRef } from "react";
import { useSleep, formatSleepDuration } from "@/hooks/useSleep";

interface SparkData { value: number }

const MiniSparkline = forwardRef<SVGSVGElement, { data: SparkData[]; color?: string }>(
  ({ data, color = "hsl(var(--primary))" }, ref) => {
    if (data.length < 2) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const min = Math.min(...data.map(d => d.value), 0);
    const range = max - min || 1;
    const w = 80, h = 24;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg ref={ref} width={w} height={h} className="mt-1">
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    );
  }
);
MiniSparkline.displayName = "MiniSparkline";

interface Props {
  onClick: () => void;
  clientId?: string;
}

const SleepCard = ({ onClick, clientId }: Props) => {
  const { entries, todayEntry } = useSleep(clientId);

  // Build last-7 sparkline (oldest -> newest)
  const last7 = entries.slice(0, 7).reverse();
  const spark: SparkData[] = last7.map((e) => ({ value: (e.total_minutes ?? 0) / 60 }));
  while (spark.length < 7) spark.unshift({ value: 0 });

  const display = todayEntry?.total_minutes
    ? formatSleepDuration(todayEntry.total_minutes)
    : "—";

  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Moon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate">Sleep</span>
      </div>
      <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
        {display}
      </div>
      <MiniSparkline data={spark} />
    </button>
  );
};

export default SleepCard;
