

# Plan: Fix Remaining Bugs After Initial Changes

## Analysis Summary

I tested the `search-foods` edge function — it's working and returning OpenFoodFacts results correctly. The macro math fix and FK fix in `MealPlanBuilder.tsx` look correct. The emoji file looks good. However, I found one remaining bug:

## Bug: `parseServingGrams` doesn't parse `ml` inside parentheses

**Location**: `supabase/functions/search-foods/index.ts` lines 264-273 (same function exists in `barcode-lookup/index.ts`)

**Problem**: Many OpenFoodFacts products have serving descriptions like `"1 portion (240 ml)"` or `"1 bottle (414 ml)"`. The current `parseServingGrams` function only matches:
- `(NNNg)` — grams in parentheses
- `NNNg` — plain grams  
- `NNNml` — plain ml (whole string only)

It does NOT match `(240 ml)` — ml inside parentheses. This causes `serving_size_g` to default to `100` instead of the actual `240`.

**Impact**: The displayed per-serving calories will be wrong (showing per-100g values as per-serving). However, the macro **scaling** still works correctly because `calories_per_100` is now passed through directly. This is a display accuracy issue.

**Fix**: Add a regex for ml inside parentheses and also for `NNN ml` as a plain pattern:

```typescript
function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const parenG = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenG) return parseFloat(parenG[1]);
  const parenMl = raw.match(/\((\d+(?:\.\d+)?)\s*ml\)/i);
  if (parenMl) return parseFloat(parenMl[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  const numOnly = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|ml)/i);
  if (numOnly) return parseFloat(numOnly[1]);
  return null;
}
```

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/search-foods/index.ts` | Fix `parseServingGrams` to handle `(NNN ml)` pattern |
| `supabase/functions/barcode-lookup/index.ts` | Same fix to its copy of `parseServingGrams` |

## What's Already Working

- **Macro math**: `calories_per_100` flows through directly from edge function → FoodSearchPanel → MealPlanBuilder. No more double-conversion. Verified with curl test.
- **FK constraint**: `food_item_id` is now always `null` in `handleSave`, using `custom_name` instead. No more FK violations.
- **Search priority**: Local → OpenFoodFacts → USDA. FatSecret removed. Confirmed via edge function test returning OFF results.
- **Food emojis**: Specific fruits (pineapple, blueberry, etc.) ordered before generic patterns.
- **Existing plan loading**: Fallback math on line 231 correctly derives `cal_per_100` from saved `item.calories / item.gram_amount * 100` when `food_item_id` is null.

