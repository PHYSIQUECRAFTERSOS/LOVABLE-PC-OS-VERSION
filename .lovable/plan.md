# Fix Meal Plan Notes & Post-Workout Save Error

## Problems
1. **Duplicating a template** copies meals/foods but drops both the per-meal coach notes (e.g., "TAKE 1 PILL BERBERINE") and per-food notes.
2. **Saving a meal to the library** strips coach notes — when pasted back later, the notes are gone.
3. **Post-Workout meal save fails** with `saved_meal_items_food_item_id_fkey` violation. Cause: that meal contains a food whose `food_item_id` is a UUID string but the referenced row no longer exists in `food_items` (orphan) — the RPC casts the value and the FK rejects it.

## Fix Plan

### 1. Template duplication preserves notes
`src/components/nutrition/MealPlanTemplateLibrary.tsx › duplicateTemplate`
- Add `note` to the columns selected from `meal_plan_items` and include it in the insert (so per-food notes copy).
- After inserting items for each new day, also copy rows from `meal_plan_meal_notes` for the original `day.id` → insert duplicates pointing at `newDay.id` (preserve `meal_order` + `note`).

### 2. Saved meals carry notes
**Migration** (new):
- `ALTER TABLE public.saved_meals ADD COLUMN IF NOT EXISTS note TEXT;`
- `ALTER TABLE public.saved_meal_items ADD COLUMN IF NOT EXISTS note TEXT;`
- `CREATE OR REPLACE FUNCTION public.save_meal_with_items(...)` updated to:
  - Accept new `p_meal_note TEXT DEFAULT NULL` param and insert into `saved_meals.note`.
  - Accept `note TEXT` per item in `p_items` and insert into `saved_meal_items.note`.
  - **Bug fix**: when `food_item_id` is provided but not found in `public.food_items`, coerce it to `NULL` instead of letting the FK reject the entire insert. Implementation: `LEFT JOIN public.food_items fi ON fi.id = NULLIF(item.food_item_id,'')::uuid` and write `fi.id` (which is NULL on miss). This unblocks the chicken-and-rice post-workout meal.
  - Re-grant EXECUTE to `authenticated` with the new signature; drop the old signature.

**Builder save call** (`MealPlanBuilder.tsx › handleSaveMealToLibrary`)
- Pass `p_meal_note: meal.note?.trim() || null`.
- Include `note: food.note?.trim() || null` on each item in `p_items`.

### 3. Pasting a saved meal restores notes
`src/components/nutrition/FoodSearchPanel.tsx`
- `loadSavedMeals`: also select `note` from `saved_meals`; `saved_meal_items` already `select("*")` so per-item `note` flows through.
- `handleSelectSavedMeal`: pass `meal.note` and per-food `note` up through a new optional second argument.
- Change `onSelectSavedMeal` prop signature to `(foods, meta?: { mealNote?: string })` where each `FoodResult` also carries a `note` field.

`src/components/nutrition/MealPlanBuilder.tsx › addSavedMealFoods`
- Accept `(dayId, mealId, foods, meta)`. When `meta.mealNote` is set and the target meal currently has no note, set `meal.note = meta.mealNote`. Map each incoming food's `note` onto the newly created food row.

## Technical Notes
- `meal_plan_items.note` and `meal_plan_meal_notes` already exist and are used by the builder save path — only the duplication path was missing them.
- The FK fix is intentionally permissive (NULL out unknown FK) rather than failing; the macros, name, and per-100g fields are already captured on `saved_meal_items` so the saved meal stays nutritionally correct without a linked `food_items` row.
- No UI redesign — coach-note textareas already exist on every meal.

## Files Touched
- `supabase/migrations/<new>.sql` (columns + updated RPC)
- `src/components/nutrition/MealPlanTemplateLibrary.tsx`
- `src/components/nutrition/MealPlanBuilder.tsx`
- `src/components/nutrition/FoodSearchPanel.tsx`
