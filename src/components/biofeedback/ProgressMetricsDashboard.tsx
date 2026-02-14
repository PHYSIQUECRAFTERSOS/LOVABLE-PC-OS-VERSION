import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import { TrendingDown, TrendingUp, Minus, Sparkles, Loader2, RefreshCw, Activity, Scale, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WeightEntry {
  weight: number;
  logged_at: string;
}

interface MeasurementEntry {
  body_fat_pct: number | null;
  waist: number | null;
  chest: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
  measured_at: string;
}

const TrendIcon = ({ val }: { val: number }) => {
  if (val < -0.1) return <TrendingDown className="h-4 w-4 text-primary" />;
  if (val > 0.1) return <TrendingUp className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

const ProgressMetricsDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementEntry[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [wRes, mRes] = await Promise.all([
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("client_id", user.id)
          .order("logged_at", { ascending: true })
          .limit(60),
        supabase
          .from("body_measurements")
          .select("body_fat_pct, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, measured_at")
          .eq("client_id", user.id)
          .order("measured_at", { ascending: true })
          .limit(30),
      ]);
      setWeights(wRes.data || []);
      setMeasurements(mRes.data || []);
    };
    fetchData();
  }, [user]);

  const fetchInsights = async () => {
    setLoadingInsights(true);
    try {
      const { data, error } = await supabase.functions.invoke("progress-insights");
      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI Insights", description: data.error, variant: "destructive" });
      } else {
        setInsights(data?.insights || "No insights available.");
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to fetch insights", variant: "destructive" });
    } finally {
      setLoadingInsights(false);
    }
  };

  // Computed stats
  const weightChange = weights.length >= 2
    ? (weights[weights.length - 1].weight - weights[0].weight)
    : null;

  const bfData = measurements.filter((m) => m.body_fat_pct !== null);
  const bfChange = bfData.length >= 2
    ? (bfData[bfData.length - 1].body_fat_pct! - bfData[0].body_fat_pct!)
    : null;

  const waistData = measurements.filter((m) => m.waist !== null);
  const waistChange = waistData.length >= 2
    ? (waistData[waistData.length - 1].waist! - waistData[0].waist!)
    : null;

  const weightChartData = weights.map((w) => ({
    date: format(new Date(w.logged_at), "MMM d"),
    weight: Number(w.weight),
  }));

  const bfChartData = bfData.map((m) => ({
    date: format(new Date(m.measured_at), "MMM d"),
    bodyFat: Number(m.body_fat_pct),
  }));

  const measurementChartData = measurements.map((m) => ({
    date: format(new Date(m.measured_at), "MMM d"),
    waist: m.waist ? Number(m.waist) : undefined,
    chest: m.chest ? Number(m.chest) : undefined,
    hips: m.hips ? Number(m.hips) : undefined,
    arm: m.left_arm ? Number(m.left_arm) : undefined,
    thigh: m.left_thigh ? Number(m.left_thigh) : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="text-2xl font-bold">
                    {weights.length > 0 ? `${weights[weights.length - 1].weight}` : "—"}
                  </p>
                </div>
              </div>
              {weightChange !== null && (
                <div className="flex items-center gap-1 text-sm">
                  <TrendIcon val={weightChange} />
                  <span className={weightChange < 0 ? "text-primary" : weightChange > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {weightChange > 0 ? "+" : ""}{weightChange.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Body Fat</p>
                  <p className="text-2xl font-bold">
                    {bfData.length > 0 ? `${bfData[bfData.length - 1].body_fat_pct}%` : "—"}
                  </p>
                </div>
              </div>
              {bfChange !== null && (
                <div className="flex items-center gap-1 text-sm">
                  <TrendIcon val={bfChange} />
                  <span className={bfChange < 0 ? "text-primary" : bfChange > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {bfChange > 0 ? "+" : ""}{bfChange.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Waist</p>
                  <p className="text-2xl font-bold">
                    {waistData.length > 0 ? `${waistData[waistData.length - 1].waist} cm` : "—"}
                  </p>
                </div>
              </div>
              {waistChange !== null && (
                <div className="flex items-center gap-1 text-sm">
                  <TrendIcon val={waistChange} />
                  <span className={waistChange < 0 ? "text-primary" : waistChange > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {waistChange > 0 ? "+" : ""}{waistChange.toFixed(1)} cm
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="weight" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="weight">Weight</TabsTrigger>
          <TabsTrigger value="bodyfat">Body Fat</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
        </TabsList>

        <TabsContent value="weight" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Weight Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {weightChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={weightChartData}>
                    <defs>
                      <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fill="url(#weightGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Need at least 2 weight entries to show a trend.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bodyfat" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Body Fat % Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {bfChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={bfChartData}>
                    <defs>
                      <linearGradient id="bfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="bodyFat" stroke="hsl(var(--primary))" fill="url(#bfGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Need at least 2 body fat entries to show a trend.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="measurements" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Body Measurements</CardTitle>
            </CardHeader>
            <CardContent>
              {measurementChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={measurementChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="waist" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Waist" />
                    <Line type="monotone" dataKey="chest" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} name="Chest" />
                    <Line type="monotone" dataKey="hips" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Hips" />
                    <Line type="monotone" dataKey="arm" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Arm" />
                    <Line type="monotone" dataKey="thigh" stroke="hsl(var(--secondary-foreground))" strokeWidth={2} dot={false} name="Thigh" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Need at least 2 measurement entries to show trends.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> AI Insights
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchInsights} disabled={loadingInsights}>
              {loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1">{insights ? "Refresh" : "Generate"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {insights ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {insights}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Generate" to get AI-powered analysis of your progress trends.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressMetricsDashboard;
