## Problem

When a coach uses Master Libraries → Meal Plan Template Builder → "Save Meal to Library", the save fails with:

> `saved_meals row <uuid> has zero items at commit time. Empty meals are not allowed.`

### Root cause

`MealPlanBuilder.handleSaveMealToLibrary()` (src/components/nutrition/MealPlanBuilder.tsx, ~lines 576–634) performs **two separate Supabase calls**:
1. `INSERT INTO saved_meals` (commits immediately as its own transaction)
2. `INSERT INTO saved_meal_items` (separate transaction)

A `DEFERRABLE INITIALLY DEFERRED` constraint trigger (`trg_enforce_saved_meal_has_items`) fires at COMMIT of step 1 and sees zero child items → raises the error. The parent row is rejected before the second call even runs.

A transactional RPC `public.save_meal_with_items(name, meal_type, calories, protein, carbs, fat, servings, items jsonb)` already exists (migration `20260429040852…`) and does both inserts in a single transaction, satisfying the deferred check. It just isn't being used here. Other call sites (e.g. `FoodLogger`, `SavedMealDetail`) work because they either insert items in the same flow or were patched separately.

## Fix

Switch `MealPlanBuilder`'s "Save Meal to Library" handler to call the existing `save_meal_with_items` RPC instead of doing two raw inserts.

### File: `src/components/nutrition/MealPlanBuilder.tsx`

Replace the body of `handleSaveMealToLibrary` (the two `supabase.from("saved_meals").insert(...)` + `supabase.from("saved_meal_items").insert(...)` calls) with a single:

```ts
const { data, error } = await supabase.rpc("save_meal_with_items", {
  p_name: saveMealName.trim(),
  p_meal_type: "custom",
  p_calories: Math.round(totalMacros.calories),
  p_protein: Math.round(totalMacros.protein),
  p_carbs: Math.round(totalMacros.carbs),
  p_fat: Math.round(totalMacros.fat),
  p_servings: 1,
  p_items: meal.foods.map((food) => ({
    food_item_id: food.food_item_id || "",
    food_name: food.food_name,
    quantity: food.gram_amount,
    serving_unit: food.serving_unit || "g",
    serving_size_g: food.serving_size_g || food.gram_amount,
    calories: Math.round((food.cal_per_100 * food.gram_amount) / 100),
    protein: Math.round((food.protein_per_100 * food.gram_amount) / 100),
    carbs: Math.round((food.carbs_per_100 * food.gram_amount) / 100),
    fat: Math.round((food.fat_per_100 * food.gram_amount) / 100),
    calories_per_100g: food.cal_per_100,
    protein_per_100g: food.protein_per_100,
    carbs_per_100g: food.carbs_per_100,
    fat_per_100g: food.fat_per_100,
  })),
});
if (error) throw error;
```

Keep the existing client-side guards (name required, at least one food, loading state, success toast, dialog close).

## What this fixes

- Saving a meal from the template builder works on the first try with the name the coach types in the dialog.
- The saved meal lands in the coach's Saved Meals library with its full food list and macros intact, so it can be reused via "Saved Meals" / "Copy From Client" to assemble future meal plans quickly.
- No orphan/empty `saved_meals` rows are created, since both inserts now commit together.

## Out of scope

- No DB schema changes (the RPC already exists; the deferred trigger is correct and stays).
- No changes to other save-meal call sites (`FoodLogger`, `SavedMealDetail`, `FoodSearchPanel`) — they're not part of the reported bug.
- No changes to how saved meals are listed or imported back into the template builder.
