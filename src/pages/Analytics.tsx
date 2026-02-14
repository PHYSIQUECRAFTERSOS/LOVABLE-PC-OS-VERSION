import AppLayout from "@/components/AppLayout";
import { useTDEE } from "@/hooks/useTDEE";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, TrendingDown, TrendingUp, Minus, Flame, Target, Brain, RefreshCw, BarChart3, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AdherenceAnalytics from "@/components/nutrition/AdherenceAnalytics";

const GoalSelector = ({ currentGoal, aggressiveness, onSaved }: { currentGoal: string | null; aggressiveness?: number; onSaved: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [goal, setGoal] = useState(currentGoal || "cut");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (currentGoal) setGoal(currentGoal); }, [currentGoal]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const targetRate = goal === "maintain" ? 0 : goal === "reverse_diet" ? 0.15 : 0.5;
    const { error } = await supabase.from("client_goals").upsert(
      { client_id: user.id, goal, target_rate: targetRate },
      { onConflict: "client_id" }
    );
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Goal updated" });
      onSaved();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={goal} onValueChange={setGoal}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cut">Fat Loss</SelectItem>
          <SelectItem value="maintain">Maintain</SelectItem>
          <SelectItem value="lean_gain">Lean Gain</SelectItem>
          <SelectItem value="reverse_diet">Reverse Diet</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={saving || goal === currentGoal}>
        {saving ? "..." : "Set"}
      </Button>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color?: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-secondary p-2">
          <Icon className="h-4 w-4" style={color ? { color } : undefined} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const Analytics = () => {
  const { result, loading, recalculate } = useTDEE();
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const data = result;
  const needsData = !data || data.dataPoints < 3;

  const rateIcon = data && data.weightChangeRate < -0.1 ? TrendingDown : data && data.weightChangeRate > 0.1 ? TrendingUp : Minus;
  const rateColor = data?.currentGoal?.goal === "cut"
    ? (data.weightChangeRate < -0.1 ? "hsl(120 60% 50%)" : "hsl(0 70% 55%)")
    : data?.currentGoal?.goal === "lean_gain"
      ? (data.weightChangeRate > 0.1 ? "hsl(120 60% 50%)" : "hsl(var(--muted-foreground))")
      : "hsl(var(--muted-foreground))";

  const chartData = data?.weightHistory.map(w => ({
    date: format(new Date(w.date), "MM/dd"),
    weight: w.weight,
    avg7: w.avg7,
  })) || [];

  const tdeeChartData = data?.tdeeHistory.map(t => ({
    date: format(new Date(t.date), "MM/dd"),
    tdee: t.tdee,
  })) || [];

  const tooltipStyle = {
    backgroundColor: "hsl(0 0% 10%)",
    border: "1px solid hsl(0 0% 16%)",
    borderRadius: 8,
    color: "hsl(45 10% 90%)",
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">TDEE, adherence & progress tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <GoalSelector currentGoal={data?.currentGoal?.goal || null} onSaved={recalculate} />
            <Button variant="ghost" size="icon" onClick={recalculate}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="engine" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="engine" className="gap-2"><Flame className="h-4 w-4" /> Adaptive Engine</TabsTrigger>
            <TabsTrigger value="adherence" className="gap-2"><BarChart3 className="h-4 w-4" /> Adherence</TabsTrigger>
          </TabsList>

          <TabsContent value="engine" className="space-y-6 mt-6">
            {needsData ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold text-foreground">Need More Data</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                    Log at least 3 days of weight entries and food to unlock your adaptive TDEE engine.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Key Stats - hide TDEE math from clients */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {isCoach && (
                    <StatCard icon={Flame} label="Est. TDEE" value={`${data!.estimatedTDEE.toLocaleString()}`} sub="kcal/day" color="hsl(var(--primary))" />
                  )}
                  <StatCard icon={rateIcon} label="Weekly Rate" value={`${data!.weightChangeRate > 0 ? "+" : ""}${data!.weightChangeRate} lb`} sub="/week" color={rateColor} />
                  <StatCard icon={Target} label="Adherence" value={`${data!.adherencePct}%`} sub={`${data!.dataPoints} data points`} />
                  <StatCard icon={Activity} label="Avg Intake" value={`${data!.avgDailyCalories.toLocaleString()}`} sub="kcal/day" />
                  {isCoach && data!.metabolicAdaptationPct !== 0 && (
                    <StatCard icon={Zap} label="Adaptation" value={`${data!.metabolicAdaptationPct}%`} sub="TDEE shift" />
                  )}
                </div>

                {/* Predicted 4-week (coach only) */}
                {isCoach && data!.predicted4WeekWeight && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Brain className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">4-Week Projection</p>
                          <p className="text-xs text-muted-foreground">
                            Current: {data!.rollingAvg7 || data!.avgWeight} lb → Predicted: <span className="text-primary font-semibold">{data!.predicted4WeekWeight} lb</span>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Weekly Insight */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          {isCoach ? "Coaching Insight" : "Your Progress"}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{data!.weeklyInsight}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Weight Trend Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Weight Trend & 7-Day Average</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {chartData.length > 1 ? (
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                            <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Line type="monotone" dataKey="weight" stroke="hsl(0 0% 40%)" strokeWidth={1} dot={{ r: 2, fill: "hsl(0 0% 55%)" }} name="Daily" />
                            <Line type="monotone" dataKey="avg7" stroke="hsl(43 72% 55%)" strokeWidth={2.5} dot={false} name="7-Day Avg" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">Not enough weight data yet.</p>
                    )}
                  </CardContent>
                </Card>

                {/* TDEE History (coach only) */}
                {isCoach && tdeeChartData.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Expenditure Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={tdeeChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                            <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="tdee" stroke="hsl(43 72% 55%)" fill="hsl(43 72% 55% / 0.1)" strokeWidth={2} name="TDEE" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Adjustment History */}
                {data!.adjustmentHistory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Adjustment History</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data!.adjustmentHistory.map((adj) => (
                        <div key={adj.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {adj.previous_calories} → {adj.new_calories} kcal
                            </p>
                            <p className="text-xs text-muted-foreground">{adj.reason}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(adj.adjustment_date), "MMM d")}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="adherence" className="mt-6">
            <AdherenceAnalytics />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Analytics;
