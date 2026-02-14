import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useTDEE } from "@/hooks/useTDEE";
import { format, subDays } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Area, AreaChart,
} from "recharts";
import {
  Activity, TrendingDown, TrendingUp, Minus, Flame, Target, Brain,
  AlertTriangle, CheckCircle2, XCircle, Clock, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { calculateAdequacyScore } from "@/lib/micronutrients";
import { MICRONUTRIENTS } from "@/lib/micronutrients";

const CoachNutritionAnalytics = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [microScore, setMicroScore] = useState<number>(0);
  const [weeklyMacros, setWeeklyMacros] = useState<any[]>([]);
  const [weightVsIntake, setWeightVsIntake] = useState<any[]>([]);

  // Use TDEE for selected client
  const { result: tdee, loading: tdeeLoading } = useTDEE(selectedClient || undefined);

  useEffect(() => {
    if (!user) return;
    const loadClients = async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");
      if (!data) return;

      const clientIds = data.map((d) => d.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);

      setClients(
        (profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || "Client" }))
      );
      if (profiles && profiles.length > 0 && !selectedClient) {
        setSelectedClient(profiles[0].user_id);
      }
    };
    loadClients();
  }, [user]);

  useEffect(() => {
    if (!selectedClient) return;
    const loadClientData = async () => {
      const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");

      // Load suggestions, micro data, weekly macros in parallel
      const [sugRes, logsRes, weightsRes, microLogsRes] = await Promise.all([
        supabase.from("weekly_calorie_suggestions")
          .select("*")
          .eq("client_id", selectedClient)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("nutrition_logs")
          .select("logged_at, calories, protein, carbs, fat")
          .eq("client_id", selectedClient)
          .gte("logged_at", thirtyDaysAgo),
        supabase.from("weight_logs")
          .select("logged_at, weight")
          .eq("client_id", selectedClient)
          .gte("logged_at", thirtyDaysAgo)
          .order("logged_at", { ascending: true }),
        supabase.from("nutrition_logs")
          .select("*")
          .eq("client_id", selectedClient)
          .eq("logged_at", today),
      ]);

      setSuggestions(sugRes.data || []);

      // Calculate micro score for today
      const microIntakes: Record<string, number> = {};
      (microLogsRes.data || []).forEach((log: any) => {
        MICRONUTRIENTS.forEach((n) => {
          microIntakes[n.key] = (microIntakes[n.key] || 0) + (log[n.key] || 0);
        });
      });
      setMicroScore(calculateAdequacyScore(microIntakes));

      // Build weekly macro data
      const dailyMacros: Record<string, { cals: number; protein: number; carbs: number; fat: number }> = {};
      (logsRes.data || []).forEach((log: any) => {
        if (!dailyMacros[log.logged_at]) dailyMacros[log.logged_at] = { cals: 0, protein: 0, carbs: 0, fat: 0 };
        dailyMacros[log.logged_at].cals += log.calories || 0;
        dailyMacros[log.logged_at].protein += log.protein || 0;
        dailyMacros[log.logged_at].carbs += log.carbs || 0;
        dailyMacros[log.logged_at].fat += log.fat || 0;
      });

      const macroData = Object.entries(dailyMacros)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date: format(new Date(date), "MM/dd"),
          calories: Math.round(d.cals),
          protein: Math.round(d.protein),
        }));
      setWeeklyMacros(macroData);

      // Weight vs intake chart
      const weights = weightsRes.data || [];
      const combined = weights.map((w: any) => ({
        date: format(new Date(w.logged_at), "MM/dd"),
        weight: Number(w.weight),
        calories: dailyMacros[w.logged_at]?.cals || null,
      }));
      setWeightVsIntake(combined);
    };
    loadClientData();
  }, [selectedClient]);

  const handleSuggestionAction = async (id: string, status: string, modifiedCals?: number, notes?: string) => {
    const update: any = { status, resolved_at: new Date().toISOString() };
    if (modifiedCals) update.coach_modified_calories = modifiedCals;
    if (notes) update.coach_notes = notes;

    const { error } = await supabase.from("weekly_calorie_suggestions").update(update).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Suggestion ${status}` });
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
    }
  };

  const rateIcon = tdee && tdee.weightChangeRate < -0.1 ? TrendingDown : tdee && tdee.weightChangeRate > 0.1 ? TrendingUp : Minus;

  const tooltipStyle = {
    backgroundColor: "hsl(0 0% 10%)",
    border: "1px solid hsl(0 0% 16%)",
    borderRadius: 8,
    color: "hsl(45 10% 90%)",
  };

  return (
    <div className="space-y-6">
      {/* Client Selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tdee?.phaseContext && (
          <Badge variant="outline" className="capitalize">
            {tdee.phaseContext.phase.replace("_", " ")}
          </Badge>
        )}
      </div>

      {!selectedClient ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a client to view nutrition analytics
          </CardContent>
        </Card>
      ) : tdeeLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard icon={Flame} label="Est. TDEE" value={`${tdee?.estimatedTDEE?.toLocaleString() || 0}`} sub="kcal/day" />
            <MetricCard icon={rateIcon} label="Weekly Rate" value={`${(tdee?.weightChangeRate || 0) > 0 ? "+" : ""}${tdee?.weightChangeRate || 0} lb`} sub="/week" />
            <MetricCard icon={Target} label="Cal Adherence" value={`${tdee?.adherencePct || 0}%`} sub={`${tdee?.dataPoints || 0} pts`} />
            <MetricCard icon={Zap} label="Micro Score" value={`${microScore}`} sub="/100" />
            <MetricCard icon={Activity} label="Adaptation" value={`${tdee?.metabolicAdaptationPct || 0}%`} sub="TDEE shift" />
          </div>

          {/* Phase Alerts */}
          {tdee?.phaseContext.suggestedAction && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-4 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Phase Alert</p>
                  <p className="text-sm text-muted-foreground">{tdee.phaseContext.suggestedAction}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Biofeedback Summary */}
          {tdee?.biofeedback && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Biofeedback (30-Day Avg)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.biofeedback.avgSteps.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Steps/day</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.biofeedback.avgSleepHours}h</p>
                    <p className="text-xs text-muted-foreground">Sleep/night</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.biofeedback.cardioMinutes}</p>
                    <p className="text-xs text-muted-foreground">Cardio min</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.biofeedback.trainingSessions}</p>
                    <p className="text-xs text-muted-foreground">Sessions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Predicted Outcome */}
          {tdee?.predicted4WeekWeight && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  4-Week Projection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.rollingAvg7 || tdee.avgWeight} lb</p>
                    <p className="text-xs text-muted-foreground">Current</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">{tdee.predicted4WeekWeight} lb</p>
                    <p className="text-xs text-muted-foreground">Predicted</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{tdee.expectedWeeklyRate > 0 ? "+" : ""}{tdee.expectedWeeklyRate} lb</p>
                    <p className="text-xs text-muted-foreground">Target/wk</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weight vs Intake Chart */}
          {weightVsIntake.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Weight vs Calorie Intake</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightVsIntake}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                      <YAxis yAxisId="weight" orientation="left" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} domain={["dataMin - 1", "dataMax + 1"]} />
                      <YAxis yAxisId="cals" orientation="right" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="hsl(43 72% 55%)" strokeWidth={2} dot={{ r: 2 }} name="Weight (lb)" />
                      <Line yAxisId="cals" type="monotone" dataKey="calories" stroke="hsl(0 70% 55%)" strokeWidth={1.5} dot={false} name="Calories" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calorie Deviation Trend */}
          {weeklyMacros.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Daily Calorie Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyMacros}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="calories" fill="hsl(43 72% 55%)" radius={[3, 3, 0, 0]} name="Calories" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekly Calorie Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Weekly Calorie Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestions.filter((s) => s.status === "pending").length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No pending suggestions</p>
              )}
              {suggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} onAction={handleSuggestionAction} />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="text-base font-bold text-foreground">{value}</p>
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const SuggestionCard = ({ suggestion: s, onAction }: { suggestion: any; onAction: (id: string, status: string, cals?: number, notes?: string) => void }) => {
  const [notes, setNotes] = useState("");
  const [modCals, setModCals] = useState(String(s.suggested_calories));

  const statusColor = s.status === "accepted" ? "text-green-400" : s.status === "rejected" ? "text-destructive" : "text-yellow-400";
  const StatusIcon = s.status === "accepted" ? CheckCircle2 : s.status === "rejected" ? XCircle : Clock;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
          <span className="text-sm font-medium text-foreground">
            {s.current_calories} → {s.suggested_calories} kcal
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{s.reason}</p>
      {s.status === "pending" && (
        <div className="flex gap-2 items-end pt-1">
          <div className="flex-1 space-y-1">
            <Input
              type="number"
              value={modCals}
              onChange={(e) => setModCals(e.target.value)}
              className="h-8 text-xs"
              placeholder="Modified cals"
            />
          </div>
          <Button size="sm" variant="outline" className="text-green-400 border-green-500/30 h-8"
            onClick={() => onAction(s.id, "accepted", parseInt(modCals), notes)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 h-8"
            onClick={() => onAction(s.id, "rejected", undefined, notes)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
};

export default CoachNutritionAnalytics;
