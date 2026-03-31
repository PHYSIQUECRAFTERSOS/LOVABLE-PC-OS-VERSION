import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Plus, Loader2 } from "lucide-react";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { getLocalDateString } from "@/utils/localDate";
import { toast } from "sonner";

interface Remaining {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface SuggestedFood {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number;
  serving_unit: string;
  serving_label: string | null;
  log_count: number;
}

interface SuggestedFoodsProps {
  remaining: Remaining;
  userId: string;
  dateStr: string;
  onLogged: () => void;
}

const SuggestedFoods = ({ remaining, userId, dateStr, onLogged }: SuggestedFoodsProps) => {
  const [foods, setFoods] = useState<SuggestedFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const shouldShow = remaining.calories > 100 && (remaining.protein > 5 || remaining.carbs > 5 || remaining.fat > 5);

  const fetchSuggestions = useCallback(async () => {
    if (!shouldShow || !userId) return;
    setLoading(true);
    try {
      // Get user's most-logged foods from history
      const { data: history } = await supabase
        .from("user_food_history")
        .select("food_id, log_count")
        .eq("user_id", userId)
        .order("log_count", { ascending: false })
        .limit(50);

      if (!history || history.length === 0) {
        setFoods([]);
        return;
      }

      // Get food details for these items
      const foodIds = history.map(h => h.food_id);
      const { data: foodItems } = await supabase
        .from("food_items")
        .select("id, name, brand, calories, protein, carbs, fat, serving_size, serving_unit, serving_label")
        .in("id", foodIds);

      if (!foodItems) {
        setFoods([]);
        return;
      }

      // Build a map of log counts
      const countMap = new Map(history.map(h => [h.food_id, h.log_count]));

      // Filter foods that fit remaining macros (with soft buffer)
      const calBudget = remaining.calories + 50;
      const proteinBudget = remaining.protein + 10;

      const fitting = foodItems
        .filter(f => {
          const cal = Number(f.calories) || 0;
          const pro = Number(f.protein) || 0;
          return cal > 0 && cal <= calBudget && pro <= proteinBudget;
        })
        .map(f => ({
          ...f,
          calories: Number(f.calories) || 0,
          protein: Number(f.protein) || 0,
          carbs: Number(f.carbs) || 0,
          fat: Number(f.fat) || 0,
          serving_size: Number(f.serving_size) || 100,
          serving_unit: f.serving_unit || "g",
          serving_label: f.serving_label,
          log_count: countMap.get(f.id) || 0,
        }))
        .sort((a, b) => b.log_count - a.log_count)
        .slice(0, 4);

      setFoods(fitting);
    } catch {
      // Silent fail — suggestions are non-critical
    } finally {
      setLoading(false);
    }
  }, [userId, shouldShow, remaining.calories, remaining.protein]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const quickLog = async (food: SuggestedFood) => {
    setLoggingId(food.id);
    try {
      // Check for serving memory
      const { data: memory } = await supabase
        .from("user_food_serving_memory")
        .select("serving_size, serving_unit")
        .eq("user_id", userId)
        .eq("food_id", food.id)
        .maybeSingle();

      const servings = memory?.serving_size ?? 1;
      const unitUsed = memory?.serving_unit ?? food.serving_unit;

      // Calculate macros based on servings
      let multiplier = servings;
      if (unitUsed === "g" || unitUsed === "ml") {
        multiplier = servings / (food.serving_size || 100);
      }

      const logData = {
        client_id: userId,
        food_item_id: food.id,
        meal_type: "snack",
        logged_at: dateStr,
        calories: Math.round(food.calories * multiplier),
        protein: Math.round(food.protein * multiplier * 10) / 10,
        carbs: Math.round(food.carbs * multiplier * 10) / 10,
        fat: Math.round(food.fat * multiplier * 10) / 10,
        servings: multiplier,
        quantity_display: servings,
        quantity_unit: unitUsed,
      };

      const { error } = await supabase.from("nutrition_logs").insert(logData).select();
      if (error) throw error;

      // Update food history
      await supabase.rpc("log_food_to_history", {
        p_user_id: userId,
        p_food_id: food.id,
      });

      toast.success(`${food.name} logged`, { duration: 1000 });
      window.dispatchEvent(new CustomEvent("nutrition-logs-updated", { detail: { date: dateStr } }));
      onLogged();
    } catch {
      toast.error("Failed to log food");
    } finally {
      setLoggingId(null);
    }
  };

  if (!shouldShow || foods.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Foods that fit your remaining macros
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {foods.map(food => (
            <button
              key={food.id}
              onClick={() => quickLog(food)}
              disabled={loggingId === food.id}
              className="flex items-start gap-2 rounded-lg border border-border/50 bg-secondary/30 p-2.5 text-left transition-colors hover:bg-secondary/60 active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-base shrink-0 mt-0.5">{getFoodEmoji(food.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{food.name}</p>
                {food.brand && (
                  <p className="text-[10px] text-muted-foreground truncate">{food.brand}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-semibold text-primary">{food.calories}cal</span>
                  <span className="text-[10px] text-muted-foreground">
                    {food.protein}p · {food.carbs}c · {food.fat}f
                  </span>
                </div>
              </div>
              {loggingId === food.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0 mt-1" />
              ) : (
                <Plus className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuggestedFoods;
