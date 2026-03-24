

# Plan: Fix Food Search History Priority + Serving Display Issues

## Problems Identified

### 1. History foods not showing in search results
**Root cause**: In the `search-foods` edge function, `getUserFoodHistory()` fetches food details from both `food_items` and `foods` tables, but only items found in the `foods` table get `food_data` populated. Items from `food_items` (which is where most user-logged foods live — confirmed: Jasmine Rice, Chicken Breast IDs exist in `food_items` but NOT in `foods`) get `name` and `brand` but no `food_data`. The injection logic at line 324 (`if (fd)`) skips them because `fd` is undefined.

### 2. "Eggs 100g" display instead of "2 eggs"
**Root cause**: The `food_items` table has `serving_label: null` for eggs (confirmed via DB query). Without `serving_label`, the display logic falls into the "no natural serving label" branch which shows total weight in grams. Additionally, `serving_unit` is "g" for most items, so there's no natural unit to display.

### 3. EditFoodModal shows "Servings (g)" label
**Root cause**: Line 243 renders `Servings (${servingLabel})` where `servingLabel` falls back to `servingDescription` which is `"g"` (from `serving_unit`). The redundant serving button is hidden, but the label still says "Servings (g)" instead of just "Servings".

---

## Changes

### 1. Fix history injection in edge function
**File: `supabase/functions/search-foods/index.ts`**

In `getUserFoodHistory()`, when an item is found in `food_items` but NOT in `foods`, construct a synthetic `food_data` object from the `food_items` data (converting per-serving macros to per-100g format). This ensures the injection logic at line 324 can create a proper result entry.

Change the `food_items` processing (line 242) to also set `foodData` with the necessary per-100g fields derived from the food_items row:
```typescript
foodItemsRes.value.data.forEach((f: any) => {
  const ss = f.serving_size || 100;
  const factor = 100 / ss;
  nameMap.set(f.id, { 
    name: f.name, 
    brand: f.brand,
    foodData: {
      id: f.id,
      name: f.name,
      brand: f.brand,
      calories_per_100g: Math.round((f.calories || 0) * factor),
      protein_per_100g: Math.round((f.protein || 0) * factor * 10) / 10,
      carbs_per_100g: Math.round((f.carbs || 0) * factor * 10) / 10,
      fat_per_100g: Math.round((f.fat || 0) * factor * 10) / 10,
      fiber_per_100g: f.fiber ? Math.round(f.fiber * factor * 10) / 10 : null,
      sugar_per_100g: f.sugar ? Math.round(f.sugar * factor * 10) / 10 : null,
      sodium_per_100g: f.sodium ? Math.round(f.sodium * factor * 10) / 10 : null,
      serving_size_g: ss,
      serving_unit: f.serving_unit || "g",
      serving_description: f.serving_label || `${ss}g`,
      source: "local",
      is_branded: !!f.brand,
      has_complete_macros: true,
      data_quality_score: 70,
      popularity_score: 10,
    }
  });
});
```

This means when a user types "rice", their "Jasmine Rice (Cooked)" from `food_items` will now have `food_data` and get injected at the top with a high relevance score.

### 2. Fix "Eggs 100g" → "2 eggs" in daily log display
**File: `src/components/nutrition/DailyNutritionLog.tsx`**

The issue is that eggs have `serving_label: null` in `food_items`. Two-part fix:

**Part A**: In the display logic (lines 609-641), when `quantity_unit === "serving"` and there's no `serving_label`, check if the food name itself implies a countable item (or if the serving size is small enough to be a natural unit like an egg ~50g). For items logged with `quantity_unit: "serving"`, display as `{count} {foodName}` instead of `{totalWeight}g` when no serving_label exists but the count is a whole number and the food is naturally countable.

Simpler approach: when `quantity_unit === "serving"` and no `serving_label`, just show the count and food name rather than converting to grams. "3 Eggs" reads better than "150g".

**Part B**: Additionally, when `quantity_unit === "g"`, just show `{quantity}g` as it does now (this path works correctly).

### 3. Fix "Servings (g)" label in EditFoodModal
**File: `src/components/nutrition/EditFoodModal.tsx`**

Line 243: Change the label logic so when `servingLabel` is a metric unit ("g", "ml"), show just "Servings" instead of "Servings (g)":
```typescript
unit === "serving"
  ? (servingLabel && servingLabel !== "g" && servingLabel !== "ml" && servingLabel !== "gram" && servingLabel !== "grams"
      ? `Servings (${servingLabel})`
      : "Servings")
  : "Quantity"
```

---

## Files to modify
- `supabase/functions/search-foods/index.ts` — construct `foodData` for `food_items` entries so history injection works
- `src/components/nutrition/DailyNutritionLog.tsx` — fix serving display for countable items without serving_label
- `src/components/nutrition/EditFoodModal.tsx` — fix "Servings (g)" label to just "Servings" when unit is metric

