import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";

interface DailyCompletionRingProps {
  completed: number;
  total: number;
  streak: number;
}

const DailyCompletionRing = ({ completed, total, streak }: DailyCompletionRingProps) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on percentage
  const ringColor = percentage >= 80
    ? "hsl(142 71% 45%)" // green
    : percentage >= 50
      ? "hsl(48 96% 53%)" // yellow
      : "hsl(0 84% 60%)"; // red

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6 flex flex-col items-center gap-3">
        {/* Ring */}
        <div className="relative h-32 w-32">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground">{percentage}%</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Complete</span>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {streak > 0 ? `${streak} Day Streak` : "Start your streak!"}
          </span>
        </div>
        {streak === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Complete 60%+ of today's actions to begin
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyCompletionRing;
