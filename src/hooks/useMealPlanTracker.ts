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

// Canonical tracker keys: meal-1 ... meal-6 (1:1 with the 6 nutrition tracker slots)
export const MEAL_SECTIONS = [
  { key: "meal-1", label: "Meal 1", order: 0, position: 1 },
  { key: "meal-2", label: "Meal 2", order: 1, position: 2 },
  { key: "meal-3", label: "Meal 3", order: 2, position: 3 },
  { key: "meal-4", label: "Meal 4", order: 3, position: 4 },
  { key: "meal-5", label: "Meal 5", order: 4, position: 5 },
  { key: "meal-6", label: "Meal 6", order: 5, position: 6 },
] as const;

// Legacy stored meal_type keys → new canonical key (per spec ordering)
const LEGACY_KEY_TO_NEW: Record<string, string> = {
  breakfast: "meal-1",
  "pre-workout": "meal-2",
  "post-workout": "meal-3",
  lunch: "meal-4",
  dinner: "meal-5",
  snack: "meal-6",
};

/**
 * Maps any meal identifier (legacy stored key, legacy display name, or new
 * "Meal N" / "meal-N" form) to a canonical tracker key (meal-1..meal-6).
 * Backward compatible with previously logged nutrition_logs rows.
 */
export function mapMealNameToKey(mealName: string): string {
  const raw = (mealName ?? "").toString().trim();
  if (!raw) return "meal-6";

  // Already new canonical key
  if (/^meal-[1-6]$/i.test(raw)) return raw.toLowerCase();

  // "Meal N" / "Meal N (anything)" / "Meal N - x"
  const numbered = raw.match(/meal\s*[-_:]?\s*([1-6])\b/i);
  if (numbered) return `meal-${numbered[1]}`;

  // Legacy stored key
  const lower = raw.toLowerCase();
  if (LEGACY_KEY_TO_NEW[lower]) return LEGACY_KEY_TO_NEW[lower];

  // Legacy display names
  const norm = lower
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (norm.includes("breakfast")) return "meal-1";
  if (norm.includes("pre workout") || norm === "preworkout") return "meal-2";
  if (norm.includes("post workout") || norm === "postworkout") return "meal-3";
  if (norm.includes("lunch")) return "meal-4";
  if (norm.includes("dinner")) return "meal-5";
  if (norm.includes("snack")) return "meal-6";

  return "meal-6";
}

/** Parse "(Pre-Workout)" subtitle from "Meal 2 (Pre-Workout)". Returns null if no brackets. */
export function parseMealSubtitle(mealName: string | null | undefined): string | null {
  if (!mealName) return null;
  const m = mealName.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

/**
 * Returns the distinct coach meal_names for a day, ordered by their first
 * appearance in meal_order ascending. Position is 1-indexed.
 */
export function getOrderedMealNamesForDay(
  items: Array<{ day_id: string | null; meal_name: string; meal_order: number }>,
  dayId: string
): string[] {
  const minOrder = new Map<string, number>();
  for (const it of items) {
    if (it.day_id !== dayId) continue;
    const name = (it.meal_name ?? "").toString();
    const ord = Number(it.meal_order ?? 0);
    const cur = minOrder.get(name);
    if (cur === undefined || ord < cur) minOrder.set(name, ord);
  }
  return [...minOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([n]) => n);
}

/** Coach's meal_name at a given 1-indexed position within the day, or null. */
export function getCoachMealNameForPosition(
  items: Array<{ day_id: string | null; meal_name: string; meal_order: number }>,
  dayId: string,
  position: number
): string | null {
  const ordered = getOrderedMealNamesForDay(items, dayId);
  return ordered[position - 1] ?? null;
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

  /**
   * Group items by tracker key (meal-1..meal-6) using POSITION-based mapping
   * (coach's meal_order).
   */
  const getItemsBySection = useCallback(
    (dayId: string, planItems?: MealPlanFood[]) => {
      const src = planItems || items || [];
      const dayItems = src.filter((i) => i.day_id === dayId);
      const ordered = getOrderedMealNamesForDay(dayItems as any, dayId);
      const nameToPos = new Map<string, number>();
      ordered.forEach((n, idx) => nameToPos.set(n, idx + 1));
      const grouped: Record<string, MealPlanFood[]> = {};
      dayItems.forEach((item) => {
        const pos = nameToPos.get(item.meal_name);
        const key = pos && pos <= 6 ? `meal-${pos}` : mapMealNameToKey(item.meal_name);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });
      return grouped;
    },
    [items]
  );

  /** Position-based items lookup. mealKey is "meal-1".."meal-6". */
  const getItemsForMealSection = useCallback(
    (dayId: string, mealKey: string, planItems?: MealPlanFood[]): MealPlanFood[] => {
      const src = planItems || items || [];
      const match = mealKey.match(/^meal-([1-6])$/);
      if (!match) {
        return src.filter(
          (i) => i.day_id === dayId && mapMealNameToKey(i.meal_name) === mealKey
        );
      }
      const position = Number(match[1]);
      const dayItems = src.filter((i) => i.day_id === dayId);
      const coachName = getCoachMealNameForPosition(dayItems as any, dayId, position);
      if (!coachName) return [];
      return dayItems.filter((i) => i.meal_name === coachName);
    },
    [items]
  );

  /** Coach's display name for the meal at a 1-indexed position (for subtitle). */
  const getCoachMealNameAtPosition = useCallback(
    (dayId: string, position: number, planItems?: MealPlanFood[]): string | null => {
      const src = planItems || items || [];
      const dayItems = src.filter((i) => i.day_id === dayId);
      return getCoachMealNameForPosition(dayItems as any, dayId, position);
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
        calories: Number(item.calories) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        logged_at: dateStr,
        tz_corrected: true,
        quantity_display: item.gram_amount || item.serving_size || null,
        quantity_unit: item.serving_unit || "g",
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

      // Position-based meal_type assignment
      const ordered = getOrderedMealNamesForDay(dayItems as any, dayId);
      const nameToPos = new Map<string, number>();
      ordered.forEach((n, idx) => nameToPos.set(n, idx + 1));

      const entries = dayItems.map((item) => {
        const pos = nameToPos.get(item.meal_name);
        const mealType = pos && pos <= 6 ? `meal-${pos}` : mapMealNameToKey(item.meal_name);
        return {
          client_id: user.id,
          food_item_id: item.food_item_id,
          custom_name: item.custom_name,
          meal_type: mealType,
          servings: 1,
          calories: Number(item.calories) || 0,
          protein: Number(item.protein) || 0,
          carbs: Number(item.carbs) || 0,
          fat: Number(item.fat) || 0,
          logged_at: dateStr,
          tz_corrected: true,
          quantity_display: item.gram_amount || item.serving_size || null,
          quantity_unit: item.serving_unit || "g",
          ...(item.food_item_id && microsMap[item.food_item_id] ? microsMap[item.food_item_id] : {}),
        };
      });
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
    getCoachMealNameAtPosition,
    copyMealToTracker,
    copyEntireDayToTracker,
  };
}
