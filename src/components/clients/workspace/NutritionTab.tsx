import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { UtensilsCrossed } from "lucide-react";
import { format, subDays } from "date-fns";

const ClientWorkspaceNutrition = ({ clientId }: { clientId: string }) => {
  const [targets, setTargets] = useState<any>(null);
  const [todayTotals, setTodayTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");

      const [targetsRes, logsRes] = await Promise.all([
        supabase
          .from("nutrition_targets")
          .select("calories, protein, carbs, fat")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("nutrition_logs")
          .select("calories, protein, carbs, fat")
          .eq("client_id", clientId)
          .gte("logged_at", `${today}T00:00:00`)
          .lte("logged_at", `${today}T23:59:59`),
      ]);

      setTargets(targetsRes.data);
      const logs = logsRes.data || [];
      setTodayTotals({
        calories: logs.reduce((s, l) => s + (l.calories || 0), 0),
        protein: logs.reduce((s, l) => s + (l.protein || 0), 0),
        carbs: logs.reduce((s, l) => s + (l.carbs || 0), 0),
        fat: logs.reduce((s, l) => s + (l.fat || 0), 0),
      });
      setLoading(false);
    };
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const macros = [
    { label: "Calories", value: todayTotals.calories, target: targets?.calories || 0, unit: "kcal", color: "bg-primary" },
    { label: "Protein", value: todayTotals.protein, target: targets?.protein || 0, unit: "g", color: "bg-blue-500" },
    { label: "Carbs", value: todayTotals.carbs, target: targets?.carbs || 0, unit: "g", color: "bg-amber-500" },
    { label: "Fat", value: todayTotals.fat, target: targets?.fat || 0, unit: "g", color: "bg-rose-500" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          Today's Nutrition
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {macros.map((m) => {
          const pct = m.target > 0 ? Math.min(Math.round((m.value / m.target) * 100), 100) : 0;
          return (
            <div key={m.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(m.value)} / {m.target} {m.unit}
                </span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          );
        })}
        {!targets && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            No nutrition targets set for this client.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientWorkspaceNutrition;
