import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed } from "lucide-react";
import MacroRing from "@/components/nutrition/MacroRing";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";

interface MacroData {
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number; protein: number; carbs: number; fat: number };
}

const MacroSummary = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, loading } = useDataFetch<MacroData>({
    queryKey: `macros-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 } },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");

      const [logsRes, tgtRes] = await Promise.all([
        supabase.from("nutrition_logs").select("calories, protein, carbs, fat").eq("client_id", user.id).eq("logged_at", today).abortSignal(signal),
        supabase.from("nutrition_targets").select("calories, protein, carbs, fat").eq("client_id", user.id).lte("effective_date", today).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).abortSignal(signal),
      ]);

      const logs = logsRes.data || [];
      const totals = logs.reduce((acc, l) => ({ calories: acc.calories + l.calories, protein: acc.protein + l.protein, carbs: acc.carbs + l.carbs, fat: acc.fat + l.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
      const tgt = tgtRes.data?.[0];
      const targets = tgt ? { calories: tgt.calories, protein: tgt.protein, carbs: tgt.carbs, fat: tgt.fat } : { calories: 2000, protein: 150, carbs: 200, fat: 70 };

      return { totals, targets };
    },
  });

  if (loading) return <CardSkeleton lines={3} />;

  const { totals, targets } = data || { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 } };

  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5 shrink-0" /> Macros Today</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
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
