import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocalDateString, toLocalDateString } from "@/utils/localDate";

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
  serving_size: number | null;
  serving_unit: string | null;
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
  day_type: string;
  day_type_label: string;
  sort_order: number;
}

const MEAL_SECTION_MAP: Record<string, string> = {
  Breakfast: "breakfast",
  "Pre-Workout": "pre-workout",
  "Pre Workout": "pre-workout",
  "Pre-Workout Meal": "pre-workout",
  "Pre Workout Meal": "pre-workout",
  "Post-Workout": "post-workout",
  "Post Workout": "post-workout",
  "Post-Workout Meal": "post-workout",
  "Post Workout Meal": "post-workout",
  Lunch: "lunch",
  Dinner: "dinner",
  Snacks: "snack",
  Snack: "snack",
  breakfast: "breakfast",
  "pre-workout": "pre-workout",
  "post-workout": "post-workout",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
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
  const raw = mealName?.trim();
  if (!raw) return "snack";

  const direct =
    MEAL_SECTION_MAP[raw] ||
    MEAL_SECTION_MAP[raw.toLowerCase()] ||
    MEAL_SECTION_MAP[raw.replace(/\s+/g, " ")];

  if (direct) return direct;

  const normalized = raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bmeal\b/g, "")
    .trim();

  if (normalized.includes("breakfast")) return "breakfast";
  if (normalized.includes("pre workout") || normalized === "preworkout") return "pre-workout";
  if (normalized.includes("post workout") || normalized === "postworkout") return "post-workout";
  if (normalized.includes("lunch")) return "lunch";
  if (normalized.includes("dinner")) return "dinner";
  if (normalized.includes("snack")) return "snack";

  return "snack";
}

type NutritionLogsUpdatedEventDetail = {
  date: string;
  addedRows?: Array<{ id: string }>;
};

const emitNutritionLogsUpdated = (detail: NutritionLogsUpdatedEventDetail) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nutrition-logs-updated", { detail }));
  }
};

export function useMealPlanTracker(selectedDate?: Date) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateStr = selectedDate ? toLocalDateString(selectedDate) : getLocalDateString();

  // Fetch ALL active meal plans for this client
  const { data: plans } = useQuery({
    queryKey: ["client-all-meal-plans", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_plans")
        .select("id, name, flexibility_mode, coach_id, updated_at, day_type, day_type_label, sort_order")
        .eq("client_id", user!.id)
        .eq("is_template", false)
        .order("sort_order");

      return (data || []) as MealPlanData[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch days for ALL plans in one query
  const planIds = plans?.map((p) => p.id) || [];
  const { data: allDays } = useQuery({
    queryKey: ["meal-plan-days-all", planIds.join(",")],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data } = await supabase
        .from("meal_plan_days")
        .select("*, meal_plan_id")
        .in("meal_plan_id", planIds)
        .order("day_order");
      return (data || []) as (MealPlanDay & { meal_plan_id: string })[];
    },
    enabled: planIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch items for ALL plans in one query
  const { data: allItems } = useQuery({
    queryKey: ["meal-plan-items-all", planIds.join(",")],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data } = await supabase
        .from("meal_plan_items")
        .select("*, meal_plan_id")
        .in("meal_plan_id", planIds)
        .order("meal_order")
        .order("item_order");
      return (data || []) as (MealPlanFood & { meal_plan_id: string })[];
    },
    enabled: planIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Legacy single-plan compat: return first plan
  const plan = plans?.[0] || null;
  const days = allDays?.filter((d) => d.meal_plan_id === plan?.id) || null;
  const items = allItems?.filter((i) => i.meal_plan_id === plan?.id) || null;

  // Get days/items for a specific plan by day_type
  const getPlanByDayType = useCallback(
    (dayTypeKey: string) => {
      const p = plans?.find((pl) => pl.day_type === dayTypeKey);
      if (!p) return { plan: null, days: [], items: [] };
      return {
        plan: p,
        days: (allDays || []).filter((d) => d.meal_plan_id === p.id),
        items: (allItems || []).filter((i) => i.meal_plan_id === p.id),
      };
    },
    [plans, allDays, allItems]
  );

  const getItemsBySection = useCallback(
    (dayId: string, planItems?: MealPlanFood[]) => {
      const src = planItems || items || [];
      const dayItems = src.filter((i) => i.day_id === dayId);
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

  const getItemsForMealSection = useCallback(
    (dayId: string, mealKey: string, planItems?: MealPlanFood[]): MealPlanFood[] => {
      const src = planItems || items || [];
      return src.filter(
        (i) => i.day_id === dayId && mapMealNameToKey(i.meal_name) === mealKey
      );
    },
    [items]
  );

  const copyMealToTracker = useCallback(
    async (mealItems: MealPlanFood[], mealKey: string) => {
      if (!user || mealItems.length === 0) {
        console.warn("[copyMealToTracker] No user or empty items", { userId: user?.id, itemCount: mealItems.length });
        return false;
      }

      // Fetch micronutrients for items that have food_item_ids
      const foodItemIds = mealItems.map(i => i.food_item_id).filter(Boolean) as string[];
      let microsMap: Record<string, Record<string, number>> = {};
      if (foodItemIds.length > 0) {
        try {
          const { extractMicros } = await import("@/utils/micronutrientHelper");
          const { data: foodItems } = await supabase
            .from("food_items")
            .select("*")
            .in("id", foodItemIds);
          if (foodItems) {
            foodItems.forEach((fi: any) => {
              microsMap[fi.id] = extractMicros(fi, 1);
            });
          }
        } catch (err) {
          console.warn("[copyMealToTracker] Could not fetch micros:", err);
        }
      }

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
        tz_corrected: true,
        ...(item.food_item_id && microsMap[item.food_item_id] ? microsMap[item.food_item_id] : {}),
      }));
      const { data: inserted, error } = await supabase.from("nutrition_logs").insert(entries as any).select();
      if (error) {
        console.error("[copyMealToTracker] Insert error:", error);
        toast({ title: "Error copying meal", description: error.message, variant: "destructive" });
        return false;
      }
      if (!inserted || inserted.length === 0) {
        console.error("[copyMealToTracker] Insert returned no rows — possible RLS block");
        toast({ title: "Failed to copy meal", description: "Items could not be saved. Please try again.", variant: "destructive" });
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ["nutrition-logs"] });
      emitNutritionLogsUpdated({
        date: dateStr,
        addedRows: inserted.map((row) => ({ id: row.id })),
      });
      return true;
    },
    [user, dateStr, toast, queryClient]
  );

  const copyEntireDayToTracker = useCallback(
    async (dayId: string, planItems?: MealPlanFood[]) => {
      if (!user) return false;
      const src = planItems || items || [];
      const dayItems = src.filter((i) => i.day_id === dayId);
      if (dayItems.length === 0) return false;

      // Fetch micronutrients for items with food_item_ids
      const foodItemIds = dayItems.map(i => i.food_item_id).filter(Boolean) as string[];
      let microsMap: Record<string, Record<string, number>> = {};
      if (foodItemIds.length > 0) {
        try {
          const { extractMicros } = await import("@/utils/micronutrientHelper");
          const { data: foodItems } = await supabase
            .from("food_items")
            .select("*")
            .in("id", foodItemIds);
          if (foodItems) {
            foodItems.forEach((fi: any) => {
              microsMap[fi.id] = extractMicros(fi, 1);
            });
          }
        } catch (err) {
          console.warn("[copyEntireDayToTracker] Could not fetch micros:", err);
        }
      }

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
        tz_corrected: true,
        ...(item.food_item_id && microsMap[item.food_item_id] ? microsMap[item.food_item_id] : {}),
      }));
      const { data: inserted, error } = await supabase.from("nutrition_logs").insert(entries as any).select();
      if (error) {
        console.error("[copyEntireDayToTracker] Insert error:", error);
        toast({ title: "Error copying day", description: error.message, variant: "destructive" });
        return false;
      }
      if (!inserted || inserted.length === 0) {
        toast({ title: "Failed to copy day", description: "Items could not be saved.", variant: "destructive" });
        return false;
      }
      toast({ title: `${inserted.length} items logged to tracker` });
      queryClient.invalidateQueries({ queryKey: ["nutrition-logs"] });
      emitNutritionLogsUpdated({
        date: dateStr,
        addedRows: inserted.map((row) => ({ id: row.id })),
      });
      return true;
    },
    [user, items, dateStr, toast, queryClient]
  );

  return {
    plan,
    plans: plans || [],
    days,
    items,
    allDays: allDays || [],
    allItems: allItems || [],
    getPlanByDayType,
    getItemsBySection,
    getItemsForMealSection,
    copyMealToTracker,
    copyEntireDayToTracker,
  };
}
