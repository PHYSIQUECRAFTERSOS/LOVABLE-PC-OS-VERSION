

# Plan: History-First Search, Serving Size UX, and Micronutrient Pipeline Fix

## Summary

Three interconnected improvements to make the nutrition tracker competitive with MyFitnessPal and MacroFactor:

1. **History-first search ranking** — previously logged foods (e.g. "jasmine rice") surface first when typing partial queries like "rice"
2. **Natural serving sizes** — foods default to their natural serving (1 cup, 1 slice) instead of 100g, with unit toggling
3. **Micronutrient pipeline fix** — USDA micronutrient data actually flows through to the Micros dashboard (currently broken)

---

## Problem Analysis

### 1. History Ranking (your top priority)
The history boost exists in the edge function but is applied **after** the initial `limit` slice (line 582-583). If "Jasmine Rice" is result #30 but you only take the top 25, the history boost never gets a chance to promote it. Also, the boost values (+30 max for log count, +15 for recency) are too weak to overcome the base relevance score differences between generic and branded results.

**Fix**: Apply history boost **before** slicing to limit. Increase the boost ceiling for frequently logged foods so personal history dominates when there's a match.

### 2. Serving Size Defaults
FatSecret returns `serving_description` (e.g. "1 cup cooked", "1 slice") and `additional_serving_sizes` with multiple options. The `FoodDetailScreen` already supports these — but in the quick-log flow (tapping a food directly without opening detail), the default is `serving_size` in grams with unit "g". The UX should default to the natural serving description when available.

**Fix**: When a food has a `serving_description` that isn't just "Xg", default the serving unit to "serving" instead of "g" in the result rows.

### 3. Micronutrient Pipeline (completely broken)
FatSecret (the primary branded food source) returns **zero micronutrient fields**. FatSecret's API does include some micros in its serving data, but `mapFatSecretFood` ignores them. Meanwhile, USDA foods DO carry micros through `_per_100g` keys, and the import path correctly saves them. The result: only USDA-sourced foods (a minority of what users actually log) contribute micro data to the dashboard.

**Fix**: Extract available micronutrients from FatSecret serving data in `mapFatSecretFood`. For foods without micro data, add a USDA cross-reference enrichment step that finds the closest USDA generic match and backfills micros.

---

## Changes

### File: `supabase/functions/search-foods/index.ts`

**A. Move history boost before limit slice**
Currently line 582-583: `merged = deduped.slice(0, limit)` then `merged = applyHistoryBoost(merged, historyMap)`.
Change to: apply history boost to all `deduped` results first, re-sort, then slice.

**B. Increase history boost values**
Change the boost formula in `applyHistoryBoost`:
- Favorite foods: +40 → +60
- Per log count: cap 20 × 1.5 = 30 → cap 30 × 2.5 = 75
- Recency factor: 15 → 25
- This ensures a food you've logged 10+ times will always outrank a random generic result

**C. Extract FatSecret micronutrients**
In `mapFatSecretFood`, the serving data contains fields like `saturated_fat`, `cholesterol`, `calcium`, `iron`, `vitamin_a`, `vitamin_c`, `potassium`, `sodium`. Parse these and include them as `_per_100g` fields in the returned object.

**D. Propagate micros from search response to client**
The edge function already returns all fields on each food object. Ensure the USDA `_per_100g` micro fields and the new FatSecret micro fields are included in the response payload (they already are — they're spread into the food object).

### File: `src/components/nutrition/AddFoodScreen.tsx`

**E. Fix micro import during `importOFFFood`**
Currently (line 466-473), micros from `_micros_per_100g` are scaled by `servingRatio = serving_size / 100`. But `food_items` stores absolute per-serving values, not per-100g. The scaling is correct for converting per-100g to per-serving — but the `extractMicros` function then multiplies by servings count again. This double-scaling is actually correct for the final log. BUT: the `_micros_per_100g` object is only populated for foods where the search response has `${key}_per_100g` fields — which now includes both USDA and FatSecret.

No code change needed here — the existing flow works once the edge function provides the data.

**F. Default to natural serving in quick-log**
When displaying search results in the food list, if a food has `serving_description` and it's not just a gram amount, default the serving toggle to "serving" mode instead of "g".

### File: `src/components/nutrition/FoodDetailScreen.tsx`

**G. Propagate micros through FoodDetailScreen confirm**
Currently `handleConfirm` (line 157-172) only returns macros. The micros are fetched separately in `handleDetailConfirm`. But if the food was just imported and has `_micros_per_100g` on the original search result, we should pass those through to avoid a second DB round-trip. No structural change needed — the existing `handleDetailConfirm` already fetches from `food_items` after import.

---

## Technical Flow After Fix

```text
User types "rice"
  → Edge function fires local + FatSecret + USDA in parallel
  → History boost applied to ALL results (not just top 25)
  → "Jasmine Rice" (logged 12 times) gets +75 boost → ranks #1
  → FatSecret "Jasmine Rice" returns with calcium, iron, potassium micros
  → User taps → imported to food_items with micros
  → Logged to nutrition_logs with micros spread
  → Micros dashboard reads nutrition_logs → shows values
```

## Files to Modify
- `supabase/functions/search-foods/index.ts` — history boost ordering + FatSecret micros
- `src/components/nutrition/AddFoodScreen.tsx` — default serving unit logic

