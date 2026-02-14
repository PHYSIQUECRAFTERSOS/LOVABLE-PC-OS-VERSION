import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays, subWeeks } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MICRONUTRIENTS, NutrientInfo } from "@/lib/micronutrients";
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

      // Load 8 weeks of nutrition logs
      const eightWeeksAgo = format(subWeeks(new Date(), 8), "yyyy-MM-dd");
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("client_id", targetId)
        .gte("logged_at", eightWeeksAgo)
        .order("logged_at", { ascending: true });

      if (!logs || logs.length === 0) {
        setLoading(false);
        return;
      }

      // Group by week
      const weeklyAgg: Record<string, Record<string, { total: number; days: number }>> = {};
      logs.forEach((log: any) => {
        const weekNum = format(new Date(log.logged_at), "yyyy-'W'II");
        if (!weeklyAgg[weekNum]) weeklyAgg[weekNum] = {};
        MICRONUTRIENTS.forEach((n) => {
          if (!weeklyAgg[weekNum][n.key]) weeklyAgg[weekNum][n.key] = { total: 0, days: 0 };
          weeklyAgg[weekNum][n.key].total += log[n.key] || 0;
        });
        // Count unique days per week
        const dayKey = `${weekNum}_${log.logged_at}`;
        if (!weeklyAgg[weekNum]["__days"]) weeklyAgg[weekNum]["__days"] = { total: 0, days: 0 };
      });

      // Count unique days per week
      const weekDays: Record<string, Set<string>> = {};
      logs.forEach((log: any) => {
        const weekNum = format(new Date(log.logged_at), "yyyy-'W'II");
        if (!weekDays[weekNum]) weekDays[weekNum] = new Set();
        weekDays[weekNum].add(log.logged_at);
      });

      // Build weekly averages per nutrient
      const weeks = Object.keys(weeklyAgg).sort();
      const nutrientWeekly: Record<string, { week: string; value: number }[]> = {};
      const chronicFlags: NutrientInfo[] = [];

      MICRONUTRIENTS.forEach((n) => {
        const weeklyValues: { week: string; value: number }[] = [];
        let consecutiveLow = 0;

        weeks.forEach((week) => {
          const daysInWeek = weekDays[week]?.size || 1;
          const avgDaily = (weeklyAgg[week]?.[n.key]?.total || 0) / daysInWeek;
          const pctOfRDA = (avgDaily / n.rda) * 100;
          weeklyValues.push({ week: week.slice(-3), value: Math.round(pctOfRDA) });

          if (pctOfRDA < 50) {
            consecutiveLow++;
          } else {
            consecutiveLow = 0;
          }
        });

        nutrientWeekly[n.key] = weeklyValues;
        if (consecutiveLow >= 3) {
          chronicFlags.push(n);
        }
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
      {/* Chronic Deficiency Alerts */}
      {chronicLow.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Chronic Deficiencies (3+ weeks low)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {chronicLow.map((n) => (
              <div key={n.key} className="flex items-center gap-2 text-xs">
                <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                <span className="font-medium text-foreground">{n.label}</span>
                <span className="text-muted-foreground">— consistently below 50% RDA</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {chronicLow.length === 0 && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <p className="text-sm text-foreground">No chronic deficiencies detected. All nutrients within acceptable ranges.</p>
          </CardContent>
        </Card>
      )}

      {/* Weekly Micro Consistency Chart - show top deficient nutrients */}
      {chronicLow.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Weekly Nutrient Consistency (% of RDA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData[chronicLow[0]?.key] || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} domain={[0, 150]} />
                  <ReferenceLine y={100} stroke="hsl(120 60% 40%)" strokeDasharray="6 3" label={{ value: "100% RDA", fontSize: 9, fill: "hsl(120 60% 50%)" }} />
                  <ReferenceLine y={50} stroke="hsl(0 70% 50%)" strokeDasharray="6 3" label={{ value: "50%", fontSize: 9, fill: "hsl(0 70% 55%)" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 16%)", borderRadius: 8, color: "hsl(45 10% 90%)" }} />
                  {chronicLow.slice(0, 4).map((n, i) => (
                    <Line
                      key={n.key}
                      type="monotone"
                      data={weeklyData[n.key]}
                      dataKey="value"
                      stroke={["hsl(0 70% 55%)", "hsl(43 72% 55%)", "hsl(200 70% 55%)", "hsl(280 60% 55%)"][i]}
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
                <Badge key={n.key} variant="outline" className="text-[10px]" style={{ borderColor: ["hsl(0 70% 55%)", "hsl(43 72% 55%)", "hsl(200 70% 55%)", "hsl(280 60% 55%)"][i] }}>
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
