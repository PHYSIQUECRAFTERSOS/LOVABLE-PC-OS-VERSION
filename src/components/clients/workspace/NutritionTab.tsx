import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, ChevronDown, ChevronUp } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import DateNavigator from "@/components/dashboard/DateNavigator";
import { formatServingDisplay } from "@/utils/formatServingDisplay";
import MacroRing from "@/components/nutrition/MacroRing";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { mapMealNameToKey } from "@/hooks/useMealPlanTracker";

interface NutritionLog {
  id: string;
  custom_name: string | null;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  food_item_id: string | null;
  quantity_display?: number | null;
  quantity_unit?: string | null;
  servings: number;
}

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_SECTIONS = [
  { key: "meal-1", label: "Meal 1" },
  { key: "meal-2", label: "Meal 2" },
  { key: "meal-3", label: "Meal 3" },
  { key: "meal-4", label: "Meal 4" },
  { key: "meal-5", label: "Meal 5" },
  { key: "meal-6", label: "Meal 6" },
] as const;

const ClientWorkspaceNutrition = ({ clientId }: { clientId: string }) => {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [foodNames, setFoodNames] = useState<Record<string, string>>({});
  const [foodServingInfo, setFoodServingInfo] = useState<Record<string, { serving_size: number; serving_unit: string; serving_label: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({
    "meal-1": true, "meal-2": true, "meal-3": true,
    "meal-4": true, "meal-5": true, "meal-6": true,
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    const load = async () => {
      setLoading(true);

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
          .select("id, custom_name, meal_type, calories, protein, carbs, fat, food_item_id, quantity_display, quantity_unit, servings")
          .eq("client_id", clientId)
          .eq("logged_at", dateStr)
          .order("created_at", { ascending: true }),
      ]);

      setTargets(targetsRes.data as Targets | null);
      const logData = (logsRes.data as NutritionLog[]) || [];
      setLogs(logData);

      // Fetch food names
      const foodIds = logData.filter(d => d.food_item_id).map(d => d.food_item_id!);
      if (foodIds.length > 0) {
        const { data: foods } = await supabase
          .from("food_items")
          .select("id, name, serving_size, serving_unit, serving_label")
          .in("id", foodIds);
        const names: Record<string, string> = {};
        const sInfo: Record<string, { serving_size: number; serving_unit: string; serving_label: string | null }> = {};
        (foods || []).forEach((f: any) => {
          names[f.id] = f.name;
          sInfo[f.id] = { serving_size: f.serving_size, serving_unit: f.serving_unit, serving_label: f.serving_label };
        });
        setFoodNames(names);
        setFoodServingInfo(sInfo);
      } else {
        setFoodNames({});
        setFoodServingInfo({});
      }

      setLoading(false);
    };
    load();
  }, [clientId, dateStr]);

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories || 0),
      protein: acc.protein + (l.protein || 0),
      carbs: acc.carbs + (l.carbs || 0),
      fat: acc.fat + (l.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const getMealItems = (key: string) => logs.filter(l => mapMealNameToKey(l.meal_type) === key);
  const getMealTotals = (items: NutritionLog[]) =>
    items.reduce(
      (acc, l) => ({
        calories: acc.calories + (l.calories || 0),
        protein: acc.protein + (l.protein || 0),
        carbs: acc.carbs + (l.carbs || 0),
        fat: acc.fat + (l.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

  const toggleMeal = (key: string) => {
    setExpandedMeals(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const adherencePct = targets && targets.calories > 0
    ? Math.round((totals.calories / targets.calories) * 100)
    : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date Navigation */}
      <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Daily Macro Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex justify-around">
          <MacroRing label="Calories" current={Math.round(totals.calories)} target={targets?.calories || 0} color="hsl(var(--primary))" unit="kcal" />
          <MacroRing label="Protein" current={Math.round(totals.protein)} target={targets?.protein || 0} color="hsl(0 70% 55%)" />
          <MacroRing label="Carbs" current={Math.round(totals.carbs)} target={targets?.carbs || 0} color="hsl(200 70% 55%)" />
          <MacroRing label="Fat" current={Math.round(totals.fat)} target={targets?.fat || 0} color="hsl(45 80% 55%)" />
        </div>
      </div>

      {/* Meal Sections */}
      <div className="space-y-3">
        {MEAL_SECTIONS.map(({ key, label }) => {
          const items = getMealItems(key);
          const mealTotals = getMealTotals(items);
          const isExpanded = expandedMeals[key] ?? true;

          return (
            <Card key={key} className="overflow-hidden">
              <button
                onClick={() => toggleMeal(key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                  {items.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Math.round(mealTotals.protein)}g P · {Math.round(mealTotals.carbs)}g C · {Math.round(mealTotals.fat)}g F
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {mealTotals.calories > 0 ? `${Math.round(mealTotals.calories)}` : "—"}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <CardContent className="pt-0 pb-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1 py-2">Nothing logged for {label}</p>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {items.map((item) => {
                        const foodName = item.food_item_id
                          ? foodNames[item.food_item_id] || "Food"
                          : item.custom_name || "Food";
                        return (
                          <div key={item.id} className="py-2 px-1">
                            <p className="text-sm font-medium text-foreground">{foodName}</p>
                            {(() => {
                              const si = item.food_item_id ? foodServingInfo[item.food_item_id] : null;
                              const label = formatServingDisplay(si, item.quantity_display, item.quantity_unit, item.servings);
                              return label ? <p className="text-xs text-muted-foreground">{label}</p> : null;
                            })()}
                            <p className="text-xs text-primary mt-0.5">
                              {Math.round(item.calories)} cal · {Math.round(item.protein)}g P · {Math.round(item.carbs)}g C · {Math.round(item.fat)}g F
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Daily Totals */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              Daily Totals
            </CardTitle>
            {adherencePct !== null && (
              <Badge variant={adherencePct >= 80 && adherencePct <= 120 ? "default" : "secondary"} className="text-xs">
                {adherencePct}% adherence
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Calories", logged: Math.round(totals.calories), target: targets?.calories || 0, unit: "kcal" },
              { label: "Protein", logged: Math.round(totals.protein), target: targets?.protein || 0, unit: "g" },
              { label: "Carbs", logged: Math.round(totals.carbs), target: targets?.carbs || 0, unit: "g" },
              { label: "Fat", logged: Math.round(totals.fat), target: targets?.fat || 0, unit: "g" },
            ].map(m => (
              <div key={m.label} className="text-center rounded-lg border border-border/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{m.logged}</p>
                <p className="text-[10px] text-muted-foreground">/ {m.target} {m.unit}</p>
              </div>
            ))}
          </div>
          {!targets && (
            <p className="text-xs text-muted-foreground text-center pt-3">
              No nutrition targets set for this client.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientWorkspaceNutrition;
