

# Plan: Fix Nutrition Tracker — Unit Labels, History Boost, and Serving Display

## Summary

Three bugs to fix:

1. **EditFoodModal shows "g | g | oz"** — the "serving" button displays the food's `serving_unit` value, which is often `"g"`, making it identical to the actual grams button. Fix: show the natural serving description (e.g. "100g serving") or hide the serving button when it's redundant with grams.

2. **Previously logged foods not appearing in search** — when searching "chicken" or "rice", the user's history items (e.g. "Jasmine Rice (Cooked)", "Boneless Skinless Chicken Breast") don't surface. The history boost in the edge function matches by `name+brand` key, but imported foods may have different casing/names than the search results from FatSecret/USDA. Also, the history lookup queries `food_items` but many results come from the `foods` cache table with different IDs. Fix: make history matching fuzzy (contains-based) instead of exact `name::brand` matching, and inject history items directly into results when they match the query.

3. **"1 × 112g" display in daily log** — foods like chicken breast show `1 × 112g` because the `quantity_unit` is `"serving"` and the display falls into the `serving` + `si` branch that renders `count × serving_sizeg`. Fix: only show the multiplier format for naturally countable items (eggs, bars, slices), and for gram-weight servings just show the total weight.

---

## Changes

### 1. Fix "g | g | oz" in EditFoodModal

**File: `src/components/nutrition/EditFoodModal.tsx`**

- When `servingLabel` equals `"g"` or `"ml"` (i.e. the food has no natural serving description), hide the "serving" button entirely and only show `g | oz`
- This prevents the confusing duplicate "g" button
- When servingLabel is meaningful (e.g. "1 cup", "1 slice", "1 bagel"), keep all three buttons

### 2. Surface history foods in search results

**File: `supabase/functions/search-foods/index.ts`**

The history boost only works when a result from the search already matches a history item by exact `name::brand`. If the user logged "Jasmine Rice (Cooked)" from FatSecret but a new search for "rice" returns different results or different casing, the boost never fires.

Fix:
- In `applyHistoryBoost`, add **fuzzy name matching**: if the search query tokens all appear in a history entry's name, inject that history food into the results (not just boost existing results)
- In `getUserFoodHistory`, also fetch the `foods` table IDs (not just `food_items`) so history items cached in the `foods` table also get matched
- After scoring and deduping, inject any unmatched history items that contain all query tokens, with a high relevance score, at the top of results

### 3. Fix "1 × 112g" display in daily nutrition log

**File: `src/components/nutrition/DailyNutritionLog.tsx`**

The display logic at lines 609-639 has a branch (line 620-624) that shows `count × serving_sizeg` when `quantity_unit === "serving"` but there's no natural `serving_label`. 

Fix this branch:
- If `quantity_unit === "serving"` and the food's serving info is purely gram-based (i.e. `serving_label` is null and `serving_unit` is `"g"` or `"ml"`), just show the total weight in grams: `${Math.round(count * si.serving_size)}g`
- Only show the `count × description` format when `serving_label` exists and represents a natural unit (e.g. "egg", "slice", "bar", "scoop")
- Never show `1 × 112g` — that format is confusing. Either show `112g` or `1 chicken breast`

### 4. Fix handleDetailConfirm always saving "serving" unit

**File: `src/components/nutrition/AddFoodScreen.tsx`**

At line 880, `handleDetailConfirm` always sets `quantity_unit: "serving"` regardless of whether the user chose grams mode in FoodDetailScreen. Fix:
- Pass the actual unit from `FoodDetailEntry` — if the user used grams mode, store `quantity_unit: "g"` and `quantity_display` as the gram weight
- This ensures the daily log can display the correct unit

---

## Files to modify
- `src/components/nutrition/EditFoodModal.tsx` — hide redundant "serving" button when label is just "g"
- `supabase/functions/search-foods/index.ts` — inject matching history items into search results
- `src/components/nutrition/DailyNutritionLog.tsx` — fix "1 × 112g" display logic  
- `src/components/nutrition/AddFoodScreen.tsx` — pass correct unit from FoodDetailScreen
- `src/components/nutrition/FoodDetailScreen.tsx` — include `useGrams` in the returned entry

