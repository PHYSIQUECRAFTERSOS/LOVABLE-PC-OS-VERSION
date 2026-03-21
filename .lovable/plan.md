

# Fix Serving Size Display — Meal Plan Copy & Saved Meal Items

## Two Problems

**Problem 1: Meal plan → tracker copy loses serving size.** When items are copied via "Copy from meal plan", "Add to Food Tracker", or "Auto Track", the `nutrition_logs` insert does NOT include `quantity_display` or `quantity_unit`. The meal plan items table has `gram_amount`, `serving_size`, and `serving_unit` columns — but the copy logic ignores them. So the tracker shows "520 cal" with no "400g" prefix like it does for foods logged via search.

**Problem 2: Saved meal detail shows "1g" for all items.** When a meal is saved from tracker logs that were copied from the meal plan (which lack `quantity_display`/`quantity_unit`), the `saved_meal_items` rows get `quantity: 1` and `serving_unit: "serving"` (or default). The SavedMealDetail then renders `1g` because the `active_unit` falls back to "g" and `quantity` is 1. The root cause is the same: no serving metadata flows from meal plan → nutrition_logs → saved_meal_items.

## Fix Strategy

### Fix 1: Pass serving data when copying meal plan items to tracker

**Files:** `src/hooks/useMealPlanTracker.ts`, `src/components/nutrition/ClientStructuredMealPlan.tsx`

1. Update `MealPlanFood` interface to include `serving_size` and `serving_unit` (already in the DB table).
2. In `copyMealToTracker` and `copyEntireDayToTracker`, add `quantity_display` and `quantity_unit` to each insert entry:
   - `quantity_display = item.gram_amount || item.serving_size || null`
   - `quantity_unit = item.serving_unit || "g"`
3. In `handleAddSingleItem` (ClientStructuredMealPlan.tsx), do the same.

### Fix 2: Pass serving data when saving tracker logs as a meal

**File:** `src/components/nutrition/DailyNutritionLog.tsx`

In `handleSaveMealFromTracker`, include `serving_size_g` in the `saved_meal_items` insert so the SavedMealDetail can display proper amounts:
- `quantity` should use `l.quantity_display || l.servings || 1`
- `serving_unit` should use `l.quantity_unit || "serving"`
- `serving_size_g` should map from `l.quantity_display` when unit is "g"

### Fix 3: SavedMealDetail fallback display

**File:** `src/components/nutrition/SavedMealDetail.tsx`

Improve the enrichment logic at line 89-123 so that when `quantity` is 1 and `serving_unit` is generic, it falls back to the food_item's actual `serving_size`/`serving_unit` by fetching those columns alongside the items. This handles existing saved meals that were created before this fix.

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useMealPlanTracker.ts` | Add `serving_size`, `serving_unit` to `MealPlanFood` interface; include `quantity_display`/`quantity_unit` in both copy functions |
| `src/components/nutrition/ClientStructuredMealPlan.tsx` | Include `quantity_display`/`quantity_unit` in `handleAddSingleItem` insert |
| `src/components/nutrition/DailyNutritionLog.tsx` | Pass proper `quantity`/`serving_unit`/`serving_size_g` in `handleSaveMealFromTracker` |
| `src/components/nutrition/SavedMealDetail.tsx` | Enrich items with food_items serving data as fallback for legacy "1g" entries |

