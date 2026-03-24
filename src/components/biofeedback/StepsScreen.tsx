import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { Footprints, Plus } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface StepDay {
  date: string;
  label: string;
  steps: number;
}

const StepsScreen = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { todayMetrics, isNative, connection } = useHealthSync();
  const isConnected = isNative && connection?.is_connected;

  const [manualInput, setManualInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<StepDay[]>([]);
  const [range, setRange] = useState<"2W" | "1M" | "3M">("2W");

  const today = format(new Date(), "yyyy-MM-dd");

  const rangeDays = range === "2W" ? 14 : range === "1M" ? 30 : 90;

  const fetchData = async () => {
    if (!user) return;
    const startDate = format(subDays(new Date(), rangeDays), "yyyy-MM-dd");
    const { data: metrics } = await supabase
      .from("daily_health_metrics")
      .select("metric_date, steps")
      .eq("user_id", user.id)
      .gte("metric_date", startDate)
      .order("metric_date", { ascending: true });

    const dayMap: Record<string, number> = {};
    (metrics || []).forEach(m => {
      dayMap[m.metric_date] = m.steps || 0;
    });

    const result: StepDay[] = [];
    for (let i = rangeDays; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, "yyyy-MM-dd");
      result.push({
        date: dateStr,
        label: format(d, "MMM d"),
        steps: dayMap[dateStr] || 0,
      });
    }
    setData(result);
  };

  useEffect(() => {
    fetchData();
  }, [user, range]);

  // Use DB data as source of truth, merge with live HealthKit (take higher)
  const dbTodaySteps = data.find(d => d.date === today)?.steps || 0;
  const liveSteps = isConnected && todayMetrics?.steps != null ? todayMetrics.steps : 0;
  const todaySteps = Math.max(dbTodaySteps, liveSteps);

  const stepGoal = todayMetrics?.step_goal || 10000;
  const pct = Math.min(100, Math.round((todaySteps / stepGoal) * 100));

  const weekData = data.slice(-7);
  const weekAvg = weekData.length > 0
    ? Math.round(weekData.reduce((s, d) => s + d.steps, 0) / weekData.length)
    : 0;

  const handleManualLog = async () => {
    if (!user) return;
    const steps = parseInt(manualInput);
    if (!steps || steps <= 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("daily_health_metrics")
      .upsert(
        {
          user_id: user.id,
          metric_date: today,
          steps,
          source: "manual",
        },
        { onConflict: "user_id,metric_date" }
      );
    setSaving(false);
    if (error) {
      console.error("[Steps] Save error:", error);
      toast({ title: "Couldn't save. Please try again." });
    } else {
      toast({ title: "Steps logged!" });
      setManualInput("");
      fetchData();
    }
  };

  return (
    <div className="space-y-4">
      {/* Today's Steps */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Footprints className="h-4 w-4" /> Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground tabular-nums">
            {todaySteps.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">steps</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Goal: {stepGoal.toLocaleString()}</span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground">{pct}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Manual Entry */}
      {!isConnected && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-2">Log today's steps manually</p>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 8500"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="h-9 flex-1"
              />
              <Button size="sm" className="h-9 gap-1" onClick={handleManualLog} disabled={saving}>
                <Plus className="h-3.5 w-3.5" />
                Log
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Range selector */}
      <div className="flex gap-1">
        {(["2W", "1M", "3M"] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              range === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <div className="h-48 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.floor(data.length / 7) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 11,
                  }}
                  wrapperStyle={{ zIndex: 10, maxWidth: "85vw" }}
                  formatter={(value: number) => [value.toLocaleString(), "Steps"]}
                />
                <Area
                  type="monotone"
                  dataKey="steps"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#stepsGrad)"
                  dot={{ r: 2, fill: "hsl(var(--primary))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* This Week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">This Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {weekData.map(d => (
            <div key={d.date} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-16">{d.label}</span>
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all"
                  style={{ width: `${Math.min(100, (d.steps / stepGoal) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-foreground tabular-nums w-14 text-right">
                {d.steps.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t border-border mt-2">
            <span className="text-xs text-muted-foreground">Weekly Average: </span>
            <span className="text-sm font-bold text-foreground">{weekAvg.toLocaleString()} steps/day</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StepsScreen;
