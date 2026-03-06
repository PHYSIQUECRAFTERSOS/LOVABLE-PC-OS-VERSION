import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

interface QuickAddLog {
  id: string;
  food_item_id: string | null;
  custom_name: string | null;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number | null;
  sodium: number | null;
  servings: number;
}

interface MealSuggestion {
  type: "yesterday" | "usual";
  label: string;
  calories: number;
  items: QuickAddLog[];
}

const SELECT_COLS = "id, food_item_id, custom_name, meal_type, calories, protein, carbs, fat, sugar, sodium, servings, logged_at";

export function useQuickAddMeals(userId: string | undefined, selectedDate: Date) {
  const [suggestions, setSuggestions] = useState<Record<string, MealSuggestion | null>>({});
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const yesterdayStr = format(subDays(selectedDate, 1), "yyyy-MM-dd");

    const [yesterdayRes, weekRes] = await Promise.all([
      supabase
        .from("nutrition_logs")
        .select(SELECT_COLS)
        .eq("client_id", userId)
        .eq("logged_at", yesterdayStr)
        .order("created_at", { ascending: true }),
      supabase
        .from("nutrition_logs")
        .select(SELECT_COLS)
        .eq("client_id", userId)
        .gte("logged_at", format(subDays(selectedDate, 7), "yyyy-MM-dd"))
        .lt("logged_at", dateStr)
        .order("created_at", { ascending: true }),
    ]);

    const yesterdayLogs = yesterdayRes.data || [];
    const weekLogs = weekRes.data || [];

    const mealKeys = ["breakfast", "pre-workout", "post-workout", "lunch", "dinner", "snack"];
    const result: Record<string, MealSuggestion | null> = {};

    for (const key of mealKeys) {
      // Check yesterday first
      const yItems = yesterdayLogs.filter((l: any) => l.meal_type === key);
      if (yItems.length > 0) {
        const totalCal = yItems.reduce((s: number, i: any) => s + (i.calories || 0), 0);
        result[key] = {
          type: "yesterday",
          label: "Add Yesterday's Meal",
          calories: totalCal,
          items: yItems as unknown as QuickAddLog[],
        };
        continue;
      }

      // Frequency analysis for "usual" meals
      const dayItems: Record<string, any[]> = {};
      const daySignatures: Record<string, string> = {};

      for (const log of weekLogs as any[]) {
        if (log.meal_type !== key) continue;
        const day = log.logged_at as string;
        if (!dayItems[day]) dayItems[day] = [];
        dayItems[day].push(log);
        const sig = (log.food_item_id || log.custom_name || "").toString();
        daySignatures[day] = (daySignatures[day] || "") + "|" + sig;
      }

      const sigCount: Record<string, { count: number; day: string }> = {};
      for (const [day, sig] of Object.entries(daySignatures)) {
        if (!sigCount[sig]) sigCount[sig] = { count: 0, day };
        sigCount[sig].count++;
        sigCount[sig].day = day;
      }

      const best = Object.values(sigCount).sort((a, b) => b.count - a.count)[0];
      if (best && best.count >= 3) {
        const items = dayItems[best.day] || [];
        const totalCal = items.reduce((s: number, i: any) => s + (i.calories || 0), 0);
        result[key] = {
          type: "usual",
          label: "Add Your Usual Meal",
          calories: totalCal,
          items: items as unknown as QuickAddLog[],
        };
      } else {
        result[key] = null;
      }
    }

    setSuggestions(result);
    setLoading(false);
  }, [userId, selectedDate]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const quickAdd = useCallback(async (mealType: string, items: QuickAddLog[]) => {
    if (!userId) return false;
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const inserts = items.map(item => ({
      client_id: userId,
      food_item_id: item.food_item_id,
      custom_name: item.custom_name,
      meal_type: mealType,
      servings: item.servings,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      sugar: item.sugar || 0,
      sodium: item.sodium || 0,
      logged_at: dateStr,
      tz_corrected: true,
    }));

    const { error } = await supabase.from("nutrition_logs").insert(inserts);
    return !error;
  }, [userId, selectedDate]);

  return { suggestions, loading, quickAdd, refresh: fetchSuggestions };
}
