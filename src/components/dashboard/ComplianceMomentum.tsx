import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface ComplianceMomentumProps {
  data: { date: string; score: number }[];
}

const ComplianceMomentum = ({ data }: ComplianceMomentumProps) => {
  const validDays = data.filter((d) => d.score >= 0);
  const maxScore = 100;

  const getBarColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    if (score >= 0) return "bg-red-400";
    return "bg-muted";
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const avgScore = validDays.length > 0
    ? Math.round(validDays.reduce((s, d) => s + d.score, 0) / validDays.length)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            30-Day Compliance
          </CardTitle>
          <span className="text-sm font-bold text-foreground">{avgScore}% avg</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[2px] h-16">
          {data.map((day) => {
            const height = day.score >= 0 ? Math.max((day.score / maxScore) * 100, 6) : 6;
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  day.score >= 0 ? getBarColor(day.score) : "bg-muted/40",
                  isToday && "ring-1 ring-primary ring-offset-1 ring-offset-card"
                )}
                style={{ height: `${height}%` }}
                title={`${format(new Date(day.date), "MMM d")}: ${day.score >= 0 ? `${day.score}%` : "Rest"}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">
            {format(subDays(new Date(), 29), "MMM d")}
          </span>
          <span className="text-[10px] text-muted-foreground">Today</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceMomentum;
