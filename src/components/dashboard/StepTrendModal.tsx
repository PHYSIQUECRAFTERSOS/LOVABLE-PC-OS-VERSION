import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Footprints, ArrowLeft } from "lucide-react";
import { format, subDays, subMonths, subYears } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface StepTrendModalProps {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  clientName?: string;
  externalStepGoal?: number;
}

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
];

interface StepDay {
  date: string;
  label: string;
  steps: number | null;
}

const StepTrendModal = ({ open, onClose, clientId, clientName, externalStepGoal }: StepTrendModalProps) => {
  const [rangeIdx, setRangeIdx] = useState(1); // default 30D
  const [data, setData] = useState<StepDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepGoal, setStepGoal] = useState(externalStepGoal ?? 10000);

  // Sync external goal when it changes
  useEffect(() => {
    if (externalStepGoal && externalStepGoal > 0) setStepGoal(externalStepGoal);
  }, [externalStepGoal]);

  useEffect(() => {
    if (!open || !clientId) return;
    const fetchData = async () => {
      setLoading(true);
      const range = RANGES[rangeIdx];
      const startDate = range.days > 0
        ? format(subDays(new Date(), range.days), "yyyy-MM-dd")
        : "2020-01-01";

      const { data: metrics } = await supabase
        .from("daily_health_metrics")
        .select("metric_date, steps, step_goal")
        .eq("user_id", clientId)
        .gte("metric_date", startDate)
        .order("metric_date", { ascending: true });

      const dayMap: Record<string, { steps: number | null; goal: number }> = {};
      (metrics || []).forEach((m: any) => {
        dayMap[m.metric_date] = {
          steps: m.steps,
          goal: m.step_goal || 10000,
        };
      });

      // Set goal from most recent entry
      if (metrics && metrics.length > 0) {
        const lastGoal = (metrics as any[])[metrics.length - 1].step_goal;
        if (lastGoal) setStepGoal(lastGoal);
      }

      const days = range.days > 0 ? range.days : Math.max(
        Math.ceil((Date.now() - new Date(startDate).getTime()) / 86400000), 30
      );

      const result: StepDay[] = [];
      for (let i = days; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dateStr = format(d, "yyyy-MM-dd");
        const entry = dayMap[dateStr];
        result.push({
          date: dateStr,
          label: format(d, days > 90 ? "MMM" : "MMM d"),
          steps: entry?.steps ?? null,
        });
      }
      setData(result);
      setLoading(false);
    };
    fetchData();
  }, [open, clientId, rangeIdx]);

  // Compute summary stats
  const validDays = data.filter((d) => d.steps !== null && d.steps > 0);
  const avgSteps = validDays.length > 0
    ? Math.round(validDays.reduce((s, d) => s + (d.steps || 0), 0) / validDays.length)
    : 0;
  const bestDay = validDays.length > 0
    ? Math.max(...validDays.map((d) => d.steps || 0))
    : 0;
  const goalMetDays = validDays.filter((d) => (d.steps || 0) >= stepGoal).length;

  // Filter nulls for chart (gaps)
  const chartData = data.map((d) => ({
    ...d,
    steps: d.steps ?? undefined,
  }));

  const title = clientName ? `${clientName}'s Steps` : "My Steps";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Footprints className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-4">
          {/* Range tabs */}
          <div className="flex gap-1 justify-center">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={cn(
                  "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                  i === rangeIdx
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Daily</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{avgSteps.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best Day</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{bestDay.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Goal Met</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {goalMetDays} / {validDays.length}
              </p>
            </div>
          </div>

          {/* Chart */}
          {loading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : chartData.length < 2 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Footprints className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Not enough step data for this range
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="stepTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 7) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value?.toLocaleString() ?? "–", "Steps"]}
                  />
                  <ReferenceLine
                    y={stepGoal}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: "Goal",
                      position: "right",
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="steps"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#stepTrendGrad)"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StepTrendModal;
