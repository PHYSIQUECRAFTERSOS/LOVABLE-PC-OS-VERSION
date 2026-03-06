import { supabase } from "@/integrations/supabase/client";
import { getLocalDateString } from "@/utils/localDate";

export interface MealFood {
  id: string;
  name: string;
  brand: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  serving_size: number;
  serving_unit: string;
}

export interface FrequentMealTemplate {
  id: string;
  meal_name: string;
  template_name: string;
  foods: MealFood[];
  food_count: number;
  occurrence_count: number;
  total_cal: number | null;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  last_logged_at: string;
  is_pinned: boolean;
}

export function generateComboKey(foods: MealFood[]): string {
  return foods
    .map(f => f.name.toLowerCase().trim())
    .sort()
    .join("|");
}

function calcTotals(foods: MealFood[]) {
  return {
    total_cal: foods.reduce((s, f) => s + (f.calories ?? 0), 0),
    total_protein: foods.reduce((s, f) => s + (f.protein ?? 0), 0),
    total_carbs: foods.reduce((s, f) => s + (f.carbs ?? 0), 0),
    total_fat: foods.reduce((s, f) => s + (f.fat ?? 0), 0),
  };
}

export async function recordMealSnapshot(
  userId: string,
  mealName: string,
  foods: MealFood[]
): Promise<void> {
  if (!userId || foods.length < 2) return;

  const comboKey = generateComboKey(foods);
  const totals = calcTotals(foods);
  const today = getLocalDateString();

  try {
    await (supabase as any).from("meal_log_snapshots").insert({
      user_id: userId,
      meal_name: mealName,
      foods: foods,
      food_count: foods.length,
      combo_key: comboKey,
      logged_date: today,
      ...totals,
    });

    const { count } = await (supabase as any)
      .from("meal_log_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("meal_name", mealName)
      .eq("combo_key", comboKey);

    const occurrences = count ?? 0;

    if (occurrences >= 3) {
      const templateName = generateTemplateName(foods, mealName);

      await (supabase as any).from("frequent_meal_templates").upsert(
        {
          user_id: userId,
          meal_name: mealName,
          template_name: templateName,
          foods: foods,
          food_count: foods.length,
          combo_key: comboKey,
          occurrence_count: occurrences,
          last_logged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...totals,
        },
        { onConflict: "user_id,meal_name,combo_key" }
      );
    }
  } catch (err) {
    console.warn("[MealTemplates] recordMealSnapshot failed:", err);
  }
}

export async function getFrequentMeals(
  userId: string,
  mealName: string
): Promise<FrequentMealTemplate[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("frequent_meal_templates")
      .select("*")
      .eq("user_id", userId)
      .eq("meal_name", mealName)
      .eq("is_dismissed", false)
      .order("is_pinned", { ascending: false })
      .order("occurrence_count", { ascending: false })
      .limit(3);

    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      ...d,
      foods: d.foods as MealFood[],
    })) as FrequentMealTemplate[];
  } catch (err) {
    console.warn("[MealTemplates] getFrequentMeals failed:", err);
    return [];
  }
}

export async function dismissFrequentMeal(templateId: string): Promise<void> {
  await (supabase as any)
    .from("frequent_meal_templates")
    .update({ is_dismissed: true })
    .eq("id", templateId);
}

export async function pinFrequentMeal(
  templateId: string,
  isPinned: boolean
): Promise<void> {
  await (supabase as any)
    .from("frequent_meal_templates")
    .update({ is_pinned: isPinned })
    .eq("id", templateId);
}

function generateTemplateName(foods: MealFood[], mealName: string): string {
  if (foods.length === 0) return `My ${mealName}`;
  const firstTwo = foods
    .slice(0, 2)
    .map(f => f.name.split(" ").slice(0, 2).join(" "))
    .join(" + ");
  const suffix = foods.length > 2 ? ` + ${foods.length - 2} more` : "";
  return `${firstTwo}${suffix}`;
}
