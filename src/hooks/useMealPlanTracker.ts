import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export interface MealPlanFood {
  id: string;
  food_item_id: string | null;
  custom_name: string | null;
  meal_name: string;
  gram_amount: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_order: number;
  item_order: number;
  day_id: string | null;
}

export interface MealPlanDay {
  id: string;
  day_type: string;
  day_order: number;
}

export interface MealPlanData {
  id: string;
  name: string;
  flexibility_mode: boolean;
  coach_id: string;
  updated_at: string;
}

const MEAL_SECTION_MAP: Record<string, string> = {
  "Breakfast": "breakfast",
  "Pre-Workout": "pre-workout",
  "Pre Workout": "pre-workout",
  "Post-Workout": "post-workout",
  "Post Workout": "post-workout",
  "Lunch": "lunch",
  "Dinner": "dinner",
  "Snacks": "snack",
  "Snack": "snack",
  // Also support already-keyed values
  "breakfast": "breakfast",
  "pre-workout": "pre-workout",
  "post-workout": "post-workout",
  "lunch": "lunch",
  "dinner": "dinner",
  "snack": "snack",
};

export const MEAL_SECTIONS = [
  { key: "breakfast", label: "Breakfast", order: 0 },
  { key: "pre-workout", label: "Pre-Workout", order: 1 },
  { key: "post-workout", label: "Post-Workout", order: 2 },
  { key: "lunch", label: "Lunch", order: 3 },
  { key: "dinner", label: "Dinner", order: 4 },
  { key: "snack", label: "Snacks", order: 5 },
] as const;

export function mapMealNameToKey(mealName: string): string {
  return MEAL_SECTION_MAP[mealName] || MEAL_SECTION_MAP[mealName.trim()] || "snack";
}

export function useMealPlanTracker(selectedDate?: Date) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  // Fetch active meal plan
  const { data: plan } = useQuery({
    queryKey: ["client-active-meal-plan", user?.id],
    queryFn: async () => {
      const { data: plans } = await supabase
        .from("meal_plans")
        .select("id, name, flexibility_mode, coach_id, updated_at")
        .eq("client_id", user!.id)
        .eq("is_template", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!plans || plans.length === 0) return null;
      return plans[0] as MealPlanData;
    },
    enabled: !!user,
  });

  // Fetch days
  const { data: days } = useQuery({
    queryKey: ["meal-plan-days", plan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", plan!.id)
        .order("day_order");
      return (data || []) as MealPlanDay[];
    },
    enabled: !!plan,
  });

  // Fetch items
  const { data: items } = useQuery({
    queryKey: ["meal-plan-items", plan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_plan_items")
        .select("*")
        .eq("meal_plan_id", plan!.id)
        .order("meal_order")
        .order("item_order");
      return (data || []) as MealPlanFood[];
    },
    enabled: !!plan,
  });

  // Get items grouped by meal section for a specific day
  const getItemsBySection = useCallback(
    (dayId: string) => {
      if (!items) return {};
      const dayItems = items.filter((i) => i.day_id === dayId);
      const grouped: Record<string, MealPlanFood[]> = {};

      dayItems.forEach((item) => {
        const key = mapMealNameToKey(item.meal_name);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      return grouped;
    },
    [items]
  );

  // Get all items for a specific meal section across a given day
  const getItemsForMealSection = useCallback(
    (dayId: string, mealKey: string): MealPlanFood[] => {
      if (!items) return [];
      return items.filter(
        (i) => i.day_id === dayId && mapMealNameToKey(i.meal_name) === mealKey
      );
    },
    [items]
  );

  // Copy a full meal section to the tracker
  const copyMealToTracker = useCallback(
    async (mealItems: MealPlanFood[], mealKey: string) => {
      if (!user || mealItems.length === 0) return false;

      const entries = mealItems.map((item) => ({
        client_id: user.id,
        food_item_id: item.food_item_id,
        custom_name: item.custom_name,
        meal_type: mealKey,
        servings: 1,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        logged_at: dateStr,
      }));

      const { error } = await supabase.from("nutrition_logs").insert(entries);
      if (error) {
        toast({ title: "Error copying meal", description: error.message, variant: "destructive" });
        return false;
      }

      queryClient.invalidateQueries({ queryKey: ["nutrition-logs"] });
      return true;
    },
    [user, dateStr, toast, queryClient]
  );

  // Copy entire day to tracker
  const copyEntireDayToTracker = useCallback(
    async (dayId: string) => {
      if (!user || !items) return false;

      const dayItems = items.filter((i) => i.day_id === dayId);
      if (dayItems.length === 0) return false;

      const entries = dayItems.map((item) => ({
        client_id: user.id,
        food_item_id: item.food_item_id,
        custom_name: item.custom_name,
        meal_type: mapMealNameToKey(item.meal_name),
        servings: 1,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        logged_at: dateStr,
      }));

      const { error } = await supabase.from("nutrition_logs").insert(entries);
      if (error) {
        toast({ title: "Error copying day", description: error.message, variant: "destructive" });
        return false;
      }

      toast({ title: `${entries.length} items logged to tracker` });
      queryClient.invalidateQueries({ queryKey: ["nutrition-logs"] });
      return true;
    },
    [user, items, dateStr, toast, queryClient]
  );

  return {
    plan,
    days,
    items,
    getItemsBySection,
    getItemsForMealSection,
    copyMealToTracker,
    copyEntireDayToTracker,
  };
}
