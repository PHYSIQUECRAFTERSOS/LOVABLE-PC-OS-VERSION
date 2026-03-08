import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Target, Plus, Settings2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import NutritionGoalModal from "@/components/nutrition/NutritionGoalModal";

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  daily_step_goal?: number;
}

const NutritionTargetsTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [todayTotals, setTodayTotals] = useState<Targets>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [showGoalModal, setShowGoalModal] = useState(false);

  useEffect(() => { loadData(); }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const [targetsRes, logsRes] = await Promise.all([
      supabase.from("nutrition_targets").select("calories, protein, carbs, fat, daily_step_goal")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("nutrition_logs").select("calories, protein, carbs, fat")
        .eq("client_id", clientId).gte("logged_at", `${today}T00:00:00`).lte("logged_at", `${today}T23:59:59`),
    ]);
    if (targetsRes.data) setTargets(targetsRes.data as Targets);
    const logs = logsRes.data || [];
    setTodayTotals({
      calories: logs.reduce((s, l) => s + (l.calories || 0), 0),
      protein: logs.reduce((s, l) => s + (l.protein || 0), 0),
      carbs: logs.reduce((s, l) => s + (l.carbs || 0), 0),
      fat: logs.reduce((s, l) => s + (l.fat || 0), 0),
    });
    setLoading(false);
  };

  const targetPercentages = useMemo(() => {
    if (!targets) return { protein: 0, carbs: 0, fat: 0 };
    const totalCals = (targets.protein * 4) + (targets.carbs * 4) + (targets.fat * 9);
    if (totalCals === 0) return { protein: 0, carbs: 0, fat: 0 };
    return {
      protein: Math.round((targets.protein * 4 / totalCals) * 100),
      carbs: Math.round((targets.carbs * 4 / totalCals) * 100),
      fat: Math.round((targets.fat * 9 / totalCals) * 100),
    };
  }, [targets]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>;

  const macros = [
    { key: "calories" as const, label: "Calories", unit: "kcal", color: "bg-primary", textColor: "text-primary" },
    { key: "protein" as const, label: "Protein", unit: "g", color: "bg-blue-500", textColor: "text-blue-400" },
    { key: "carbs" as const, label: "Carbs", unit: "g", color: "bg-amber-500", textColor: "text-amber-400" },
    { key: "fat" as const, label: "Fat", unit: "g", color: "bg-rose-500", textColor: "text-rose-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Daily Nutrition Goals
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowGoalModal(true)} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            {targets ? "Edit Goals" : "Set Goals"}
          </Button>
        </CardHeader>
        <CardContent>
          {targets ? (
            <div className="space-y-4">
              {/* Macro split bar */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Macro Split</p>
                <div className="flex h-4 rounded-full overflow-hidden">
                  <div className="bg-blue-500 transition-all" style={{ width: `${targetPercentages.protein}%` }}>
                    {targetPercentages.protein >= 12 && <span className="text-[9px] font-bold text-white flex items-center justify-center h-full">{targetPercentages.protein}%</span>}
                  </div>
                  <div className="bg-amber-500 transition-all" style={{ width: `${targetPercentages.carbs}%` }}>
                    {targetPercentages.carbs >= 12 && <span className="text-[9px] font-bold text-white flex items-center justify-center h-full">{targetPercentages.carbs}%</span>}
                  </div>
                  <div className="bg-rose-500 transition-all" style={{ width: `${targetPercentages.fat}%` }}>
                    {targetPercentages.fat >= 12 && <span className="text-[9px] font-bold text-white flex items-center justify-center h-full">{targetPercentages.fat}%</span>}
                  </div>
                </div>
                <div className="flex justify-between">
                  {[
                    { label: "Protein", g: targets.protein, pct: targetPercentages.protein, color: "text-blue-400", bg: "bg-blue-500/10" },
                    { label: "Carbs", g: targets.carbs, pct: targetPercentages.carbs, color: "text-amber-400", bg: "bg-amber-500/10" },
                    { label: "Fat", g: targets.fat, pct: targetPercentages.fat, color: "text-rose-400", bg: "bg-rose-500/10" },
                  ].map(m => (
                    <div key={m.label} className={`text-center px-3 py-2 rounded-lg ${m.bg} flex-1 mx-0.5`}>
                      <p className={`text-lg font-bold ${m.color}`}>{m.g}g</p>
                      <p className="text-[10px] text-muted-foreground">{m.label} · {m.pct}%</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance Dashboard */}
              <div className="pt-3 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Compliance</p>
                {macros.map(m => {
                  const target = targets[m.key];
                  const current = Math.round(todayTotals[m.key]);
                  const remaining = Math.max(0, target - current);
                  const over = current > target ? current - target : 0;
                  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
                  const macroPct = m.key !== "calories" ? targetPercentages[m.key as keyof typeof targetPercentages] : null;
                  const icon = pct >= 100 ? TrendingUp : pct >= 50 ? Minus : TrendingDown;
                  const Icon = icon;

                  return (
                    <div key={m.key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3 w-3 ${pct >= 90 ? "text-green-400" : pct >= 50 ? "text-amber-400" : "text-rose-400"}`} />
                          <span className="text-sm font-medium">{m.label}</span>
                          {macroPct !== null && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              m.key === "protein" ? "bg-blue-500/10 text-blue-400" :
                              m.key === "carbs" ? "bg-amber-500/10 text-amber-400" :
                              "bg-rose-500/10 text-rose-400"
                            }`}>{macroPct}%</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold">{current}</span>
                          <span className="text-xs text-muted-foreground"> / {target} {m.unit}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{pct}% consumed</span>
                        {over > 0 ? (
                          <span className="text-rose-400 font-medium">+{over} {m.unit} over</span>
                        ) : (
                          <span>{remaining} {m.unit} remaining</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step Goal */}
              {targets.daily_step_goal && targets.daily_step_goal > 0 && (
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Daily Step Goal</span>
                    <span className="text-sm font-semibold text-foreground">{targets.daily_step_goal.toLocaleString()} steps/day</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No nutrition goals set yet.</p>
              <Button size="sm" onClick={() => setShowGoalModal(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Set Nutrition Goals
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <NutritionGoalModal
        open={showGoalModal}
        onOpenChange={setShowGoalModal}
        clientId={clientId}
        initialTargets={targets}
        onSaved={loadData}
      />
    </div>
  );
};

export default NutritionTargetsTab;
