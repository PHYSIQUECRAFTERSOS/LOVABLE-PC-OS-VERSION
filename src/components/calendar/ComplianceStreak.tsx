import { CalendarEvent } from "./CalendarGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { subDays, format, isBefore, isAfter, startOfDay } from "date-fns";

interface ComplianceStreakProps {
  events: CalendarEvent[];
}

const ComplianceStreak = ({ events }: ComplianceStreakProps) => {
  const today = startOfDay(new Date());
  const last30 = Array.from({ length: 30 }, (_, i) => format(subDays(today, 29 - i), "yyyy-MM-dd"));

  // Count completions per day (ignoring rest days)
  const actionableEvents = events.filter((e) => e.event_type !== "rest" && e.event_type !== "reminder");
  const completedByDay = last30.map((d) => {
    const dayEvents = actionableEvents.filter((e) => e.event_date === d);
    if (dayEvents.length === 0) return null; // no events
    const completed = dayEvents.filter((e) => e.is_completed).length;
    return { total: dayEvents.length, completed, pct: Math.round((completed / dayEvents.length) * 100) };
  });

  // Current streak
  let streak = 0;
  for (let i = completedByDay.length - 1; i >= 0; i--) {
    const day = completedByDay[i];
    if (day === null) continue; // skip no-event days
    if (day.pct === 100) streak++;
    else break;
  }

  const totalCompleted = actionableEvents.filter((e) => e.is_completed).length;
  const totalDue = actionableEvents.filter((e) => !isAfter(new Date(e.event_date), today)).length;
  const overallPct = totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Compliance (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <span className="text-2xl font-bold">{streak}</span>
            <span className="text-xs text-muted-foreground">day streak</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold">{overallPct}%</span>
            <p className="text-xs text-muted-foreground">compliance</p>
          </div>
        </div>

        {/* Mini heatmap */}
        <div className="flex gap-0.5">
          {completedByDay.map((day, i) => (
            <div
              key={i}
              title={`${last30[i]}: ${day ? `${day.pct}%` : "No events"}`}
              className={`h-3 flex-1 rounded-sm ${
                day === null
                  ? "bg-secondary"
                  : day.pct === 100
                  ? "bg-green-500"
                  : day.pct > 0
                  ? "bg-yellow-500"
                  : "bg-destructive/60"
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceStreak;
