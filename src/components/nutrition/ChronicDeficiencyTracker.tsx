import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subWeeks } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MICRONUTRIENTS, NutrientInfo, getOptimizationStatus } from "@/lib/micronutrients";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react";

interface ChronicDeficiencyTrackerProps {
  clientId?: string;
}

const ChronicDeficiencyTracker = ({ clientId }: ChronicDeficiencyTrackerProps) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;
  const [weeklyData, setWeeklyData] = useState<Record<string, { week: string; value: number }[]>>({});
  const [chronicLow, setChronicLow] = useState<NutrientInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetId) return;
    const load = async () => {
      setLoading(true);
      const eightWeeksAgo = format(subWeeks(new Date(), 8), "yyyy-MM-dd");
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("client_id", targetId)
        .gte("logged_at", eightWeeksAgo)
        .order("logged_at", { ascending: true });

      if (!logs || logs.length === 0) { setLoading(false); return; }

      const weeklyAgg: Record<string, Record<string, number>> = {};
      const weekDays: Record<string, Set<string>> = {};
      logs.forEach((log: any) => {
        const weekNum = format(new Date(log.logged_at), "yyyy-'W'II");
        if (!weeklyAgg[weekNum]) weeklyAgg[weekNum] = {};
        if (!weekDays[weekNum]) weekDays[weekNum] = new Set();
        weekDays[weekNum].add(log.logged_at);
        MICRONUTRIENTS.forEach((n) => {
          weeklyAgg[weekNum][n.key] = (weeklyAgg[weekNum][n.key] || 0) + (log[n.key] || 0);
        });
      });

      const weeks = Object.keys(weeklyAgg).sort();
      const nutrientWeekly: Record<string, { week: string; value: number }[]> = {};
      const chronicFlags: NutrientInfo[] = [];

      MICRONUTRIENTS.forEach((n) => {
        if (n.category === "other") return;
        const weeklyValues: { week: string; value: number }[] = [];
        let consecutiveLow = 0;
        weeks.forEach((week) => {
          const daysInWeek = weekDays[week]?.size || 1;
          const avgDaily = (weeklyAgg[week]?.[n.key] || 0) / daysInWeek;
          const pctOfOptimal = (avgDaily / n.pcOptimalMin) * 100;
          weeklyValues.push({ week: week.slice(-3), value: Math.round(pctOfOptimal) });
          if (pctOfOptimal < 50) consecutiveLow++; else consecutiveLow = 0;
        });
        nutrientWeekly[n.key] = weeklyValues;
        if (consecutiveLow >= 3) chronicFlags.push(n);
      });

      setWeeklyData(nutrientWeekly);
      setChronicLow(chronicFlags);
      setLoading(false);
    };
    load();
  }, [targetId]);

  if (loading) {
    return <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-secondary rounded-lg" />)}
    </div>;
  }

  return (
    <div className="space-y-4">
      {chronicLow.length > 0 ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Chronic Deficiencies (3+ weeks below optimal)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {chronicLow.map((n) => (
              <div key={n.key} className="flex items-center gap-2 text-xs">
                <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                <span className="font-medium text-foreground">{n.label}</span>
                <span className="text-muted-foreground">— below 50% of PC Optimal ({n.pcOptimalMin}{n.unit})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <p className="text-sm text-foreground">No chronic deficiencies. All nutrients within acceptable ranges.</p>
          </CardContent>
        </Card>
      )}

      {chronicLow.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Weekly Consistency (% of PC Optimal)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData[chronicLow[0]?.key] || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={[0, 150]} />
                  <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="6 3" label={{ value: "100% Optimal", fontSize: 9, fill: "hsl(var(--primary))" }} />
                  <ReferenceLine y={50} stroke="hsl(var(--destructive))" strokeDasharray="6 3" label={{ value: "50%", fontSize: 9, fill: "hsl(var(--destructive))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  {chronicLow.slice(0, 4).map((n, i) => (
                    <Line
                      key={n.key}
                      type="monotone"
                      data={weeklyData[n.key]}
                      dataKey="value"
                      stroke={["hsl(var(--destructive))", "hsl(var(--primary))", "hsl(200 70% 55%)", "hsl(280 60% 55%)"][i]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name={n.label}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {chronicLow.slice(0, 4).map((n, i) => (
                <Badge key={n.key} variant="outline" className="text-[10px]" style={{ borderColor: ["hsl(var(--destructive))", "hsl(var(--primary))", "hsl(200 70% 55%)", "hsl(280 60% 55%)"][i] }}>
                  {n.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ChronicDeficiencyTracker;
