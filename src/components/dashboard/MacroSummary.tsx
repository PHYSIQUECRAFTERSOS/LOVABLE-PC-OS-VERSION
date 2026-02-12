import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed } from "lucide-react";
import MacroRing from "@/components/nutrition/MacroRing";
import { format } from "date-fns";

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MacroSummary = () => {
  const { user } = useAuth();
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<Targets>({ calories: 2000, protein: 150, carbs: 200, fat: 70 });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch logs
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("calories, protein, carbs, fat")
        .eq("client_id", user.id)
        .eq("logged_at", today);

      if (logs) {
        const totaled = logs.reduce(
          (acc, l) => ({
            calories: acc.calories + l.calories,
            protein: acc.protein + l.protein,
            carbs: acc.carbs + l.carbs,
            fat: acc.fat + l.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
        setTotals(totaled);
      }

      // Fetch targets
      const { data: tgt } = await supabase
        .from("nutrition_targets")
        .select("calories, protein, carbs, fat")
        .eq("client_id", user.id)
        .lte("effective_date", today)
        .order("effective_date", { ascending: false })
        .limit(1);

      if (tgt && tgt.length > 0) {
        setTargets({
          calories: tgt[0].calories,
          protein: tgt[0].protein,
          carbs: tgt[0].carbs,
          fat: tgt[0].fat,
        });
      }
    };
    fetch();
  }, [user]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5" /> Macros Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-around">
          <MacroRing label="Calories" current={totals.calories} target={targets.calories} color="hsl(var(--primary))" unit="kcal" />
          <MacroRing label="Protein" current={totals.protein} target={targets.protein} color="hsl(0 70% 55%)" />
          <MacroRing label="Carbs" current={totals.carbs} target={targets.carbs} color="hsl(200 70% 55%)" />
          <MacroRing label="Fat" current={totals.fat} target={targets.fat} color="hsl(45 80% 55%)" />
        </div>
      </CardContent>
    </Card>
  );
};

export default MacroSummary;
