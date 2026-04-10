import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed, Dumbbell, Moon } from "lucide-react";
import MacroRing from "@/components/nutrition/MacroRing";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { resolveDayType, resolveTargetsForDayType, type DayType } from "@/utils/resolveDayType";
import { toLocalDateString } from "@/utils/localDate";

interface MacroData {
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number; protein: number; carbs: number; fat: number };
  dayType: DayType;
}

const MacroSummary = () => {
  const { user } = useAuth();
  const today = toLocalDateString(new Date());

  const { data, loading } = useDataFetch<MacroData>({
    queryKey: `macros-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 }, dayType: "training_day" },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");

      const [logsRes, tgtRes, dayType] = await Promise.all([
        supabase.from("nutrition_logs").select("calories, protein, carbs, fat").eq("client_id", user.id).eq("logged_at", today).abortSignal(signal),
        supabase.from("nutrition_targets").select("calories, protein, carbs, fat, rest_calories, rest_protein, rest_carbs, rest_fat").eq("client_id", user.id).lte("effective_date", today).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).abortSignal(signal),
        resolveDayType(user.id),
      ]);

      const logs = logsRes.data || [];
      const totals = logs.reduce((acc, l) => ({ calories: acc.calories + l.calories, protein: acc.protein + l.protein, carbs: acc.carbs + l.carbs, fat: acc.fat + l.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
      const tgt = tgtRes.data?.[0];
      const targets = tgt
        ? resolveTargetsForDayType(tgt as any, dayType)
        : { calories: 2000, protein: 150, carbs: 200, fat: 70 };

      return { totals, targets, dayType };
    },
  });

  if (loading) return <CardSkeleton lines={3} />;

  const { totals, targets, dayType } = data || { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 }, dayType: "training_day" as DayType };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 shrink-0" />
          Macros Today
          <span className={`ml-auto text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            dayType === "training_day"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary border border-border text-foreground"
          }`}>
            {dayType === "training_day" ? (
              <span className="flex items-center gap-1"><Dumbbell className="h-3 w-3" />Training</span>
            ) : (
              <span className="flex items-center gap-1"><Moon className="h-3 w-3" />Rest</span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
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
