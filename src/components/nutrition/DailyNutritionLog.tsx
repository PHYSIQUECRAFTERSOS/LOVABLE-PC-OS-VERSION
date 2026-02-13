import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MacroRing from "./MacroRing";
import FoodLogger from "./FoodLogger";
import SavedMeals from "./SavedMeals";
import BarcodeScanner from "./BarcodeScanner";


interface NutritionLog {
  id: string;
  custom_name: string | null;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servings: number;
  food_item_id: string | null;
}

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_refeed: boolean;
}

const DEFAULT_TARGETS: Targets = { calories: 2000, protein: 150, carbs: 200, fat: 70, is_refeed: false };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "pre-workout", "post-workout", "snack"];

const DailyNutritionLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [foodNames, setFoodNames] = useState<Record<string, string>>({});
  const today = format(new Date(), "yyyy-MM-dd");

  const fetchLogs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("client_id", user.id)
      .eq("logged_at", today)
      .order("created_at", { ascending: true });
    setLogs((data as NutritionLog[]) || []);

    // Fetch food names for items with food_item_id
    const foodIds = (data || []).filter(d => d.food_item_id).map(d => d.food_item_id!);
    if (foodIds.length > 0) {
      const { data: foods } = await supabase
        .from("food_items")
        .select("id, name")
        .in("id", foodIds);
      const names: Record<string, string> = {};
      (foods || []).forEach(f => { names[f.id] = f.name; });
      setFoodNames(names);
    }
  };

  const fetchTargets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("nutrition_targets")
      .select("*")
      .eq("client_id", user.id)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setTargets({
        calories: data[0].calories,
        protein: data[0].protein,
        carbs: data[0].carbs,
        fat: data[0].fat,
        is_refeed: data[0].is_refeed,
      });
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchTargets();
  }, [user]);

  const deleteLog = async (id: string) => {
    await supabase.from("nutrition_logs").delete().eq("id", id);
    fetchLogs();
  };

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const groupedLogs = MEAL_ORDER.reduce((acc, meal) => {
    const items = logs.filter(l => l.meal_type === meal);
    if (items.length > 0) acc[meal] = items;
    return acc;
  }, {} as Record<string, NutritionLog[]>);

  return (
    <div className="space-y-6">
      {/* Macro Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        {targets.is_refeed && (
          <div className="mb-3 rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary text-center">
            🔥 Refeed Day
          </div>
        )}
        <div className="flex justify-around">
          <MacroRing label="Calories" current={totals.calories} target={targets.calories} color="hsl(var(--primary))" unit="kcal" />
          <MacroRing label="Protein" current={totals.protein} target={targets.protein} color="hsl(0 70% 55%)" />
          <MacroRing label="Carbs" current={totals.carbs} target={targets.carbs} color="hsl(200 70% 55%)" />
          <MacroRing label="Fat" current={totals.fat} target={targets.fat} color="hsl(45 80% 55%)" />
        </div>
      </div>


       {/* Log Buttons */}
       <div className="flex gap-2 flex-wrap">
         <FoodLogger onLogged={fetchLogs} />
         <BarcodeScanner onLogged={fetchLogs} />
         <SavedMeals onSelectMeal={(meal) => {
           // Log the saved meal
           supabase.from("nutrition_logs").insert({
             client_id: user?.id,
             custom_name: meal.name,
             meal_type: meal.meal_type,
             calories: meal.calories,
             protein: meal.protein,
             carbs: meal.carbs,
             fat: meal.fat,
             fiber: meal.fiber || 0,
             sugar: meal.sugar || 0,
             sodium: meal.sodium || 0,
             servings: 1,
           }).then(() => fetchLogs());
         }} />
       </div>

      {/* Logged Meals */}
      <div className="space-y-4">
        {Object.entries(groupedLogs).map(([meal, items]) => (
          <div key={meal}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-foreground">{meal}</h3>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {item.food_item_id ? foodNames[item.food_item_id] || "Food" : item.custom_name}
                    </div>
                     <div className="text-xs text-muted-foreground">
                       {item.calories} cal · {item.protein}P · {item.carbs}C · {item.fat}F
                       {item.fiber ? ` · ${item.fiber}Fb` : ""}
                       {item.sugar ? ` · ${item.sugar}S` : ""}
                       {item.sodium ? ` · ${item.sodium}mg` : ""}
                     </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteLog(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No food logged today. Tap "Log Food" to get started.
          </p>
        )}
      </div>
    </div>
  );
};

export default DailyNutritionLog;
