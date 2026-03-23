

# Plan: Fix Meal Plan Template Builder Macro Math Precision

## The Problem

You have ~30+ food items in your meal plan. The current system rounds **per item** before summing, causing cumulative rounding drift of ~50 calories across the full day. Here's exactly what's happening:

**Current `calcMacros` function (line 85-94):**
```
calories: Math.round(cal_per_100 * grams / 100)  ← rounds to integer PER FOOD
protein:  +(protein_per_100 * grams / 100).toFixed(1)  ← rounds to 1 decimal PER FOOD
```

With 30 items, each rounded individually, you lose up to ±0.5 cal per item = **±15 calories** from rounding alone. But the real culprit is the **calorie vs macro mismatch**: food database calories are independently measured values, NOT derived from `(protein×4 + carbs×4 + fat×9)`. So even when protein/carbs/fat sum perfectly to your target, the database calories can diverge by 1-3 cal per item — across 30 items that's your 51 cal gap.

Additionally, `getMealTotals` (line 501) and `getDayTotals` (line 517) call `.toFixed(1)` at every accumulation step, compounding rounding errors.

## The Fix

### File: `src/components/nutrition/MealPlanBuilder.tsx`

**1. Accumulate raw floats, round only at display**

Change `calcMacros` to return unrounded values:
```typescript
const calcMacros = (food: MealFood) => {
  const m = food.gram_amount / 100;
  return {
    calories: food.cal_per_100 * m,
    protein: food.protein_per_100 * m,
    carbs: food.carbs_per_100 * m,
    fat: food.fat_per_100 * m,
    fiber: food.fiber_per_100 * m,
    sugar: food.sugar_per_100 * m,
  };
};
```

**2. Fix `getMealTotals` and `getDayTotals`** — remove per-step `.toFixed(1)` calls, accumulate raw sums, round only in the final return or at the display layer.

**3. Round at display points only** — the rendering JSX and the `MealPlanMacroSidebar` already call `Math.round()` when showing values, so no changes needed there.

**4. Keep `handleSave` persistence rounding** — when writing to `meal_plan_items`, `Math.round()` is correct for database storage (integers in the DB).

### Impact

- Sidebar totals will now be accurate to ±1 calorie across any number of items
- Protein/carbs/fat "remaining" will be precise
- No changes to the database schema, sidebar UI, or save logic
- All rounding happens at the two correct boundaries: display and persistence

### Files to modify
- `src/components/nutrition/MealPlanBuilder.tsx` — 3 functions: `calcMacros`, `getMealTotals`, `getDayTotals`

