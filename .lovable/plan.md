

# Fix Meal Plan Builder Food Quality + Custom Foods Tab

## Problems Identified

### 1. Foods showing calories but 0P/0C/0F
The edge function searches the `foods` table which caches external API results. Some cached entries have `calories_per_100g` populated but `protein_per_100g`, `carbs_per_100g`, `fat_per_100g` all as 0 or null. The filter at line 584 only checks `has_complete_macros !== false` — items that were cached before the quality trigger was added, or items with null values, slip through.

**Additionally**, `FoodSearchPanel` converts results at lines 162-179 using `Math.round()` which rounds small values to 0. For a food with e.g. 0.3g protein per 100g, `Math.round(0.3 * 1) = 0`.

**Fix (edge function + frontend)**:
- Edge function: Add explicit macro filter — exclude any food where `protein_per_100g + carbs_per_100g + fat_per_100g <= 0` in the local query and in the merge step
- FoodSearchPanel: Change `Math.round` to `parseFloat((...).toFixed(1))` for protein/carbs/fat to preserve decimals, and add a stricter filter in `deduplicateAndFilter` to exclude foods with calories > 10 but all three macros at 0

### 2. Custom foods not appearing in Recent/Favorites
In `FoodSearchPanel.onCustomFoodCreated` (line 222-225), the food is passed directly to `onSelect()` without calling `trackUsage()` first. The food never gets recorded in `user_recent_foods` or `coach_recent_foods`.

**Fix**: Call `trackUsage(food.id, food.name)` in `onCustomFoodCreated` before calling `onSelect`.

### 3. New "Custom Foods" tab
Add a `"custom"` filter tab that queries `food_items` where `data_source = 'custom'` and `created_by = user.id`. This gives coaches quick access to all their manually created foods.

**Fix**: 
- Add `"custom"` to the `FilterTab` type and `FILTERS` array
- Load custom foods from `food_items` on mount (alongside favorites and recents)
- Display them when the custom tab is active, even without a search query

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/search-foods/index.ts` | Add strict macro filter to local query and merge step |
| `src/components/nutrition/FoodSearchPanel.tsx` | Fix custom food tracking, add Custom tab, improve macro rounding, tighten dedup filter |

