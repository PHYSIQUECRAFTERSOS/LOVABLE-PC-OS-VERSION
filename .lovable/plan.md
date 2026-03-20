

# Fix Plan: Create Meal Barcode/Custom Foods + Custom Food Logging Math

## Problems Identified

1. **Create Meal "Add Items" lacks barcode scanning and custom foods tab** — only has search + history
2. **Custom food logging math is broken** — `logCustomFood()` never sets `food_item_id`, so EditFoodModal treats it as a flat custom entry with `serving_size: 1`. Editing quantity of 120 makes multiplier = 120, yielding 14,400 calories. Going back to 1 yields 0 due to rounding
3. **Display shows "1g" for non-gram units** — quantity_unit "ml" or "serving" falls through to "g" in display logic

---

## Part 1: Add Barcode + Custom Foods to Create Meal

**File: `src/components/nutrition/CreateMealSheet.tsx`**

- Add tabs to the food search screen: **Search**, **Custom Foods**, **Barcode**
- **Barcode tab**: Embed the existing `BarcodeScanner` component but intercept its result to stage the food as an ingredient instead of logging directly. Alternatively, reuse the barcode lookup service to find a food, then call `addFoodToStaged()`
- **Custom Foods tab**: Fetch from `client_custom_foods` (same as AddFoodScreen does) and from `food_items` where `data_source = 'custom'`. Display them with an "Add" button that calls `mapFoodToStaged()` and adds to items
- Add state for `searchTab` with values `"search" | "custom" | "barcode"`
- Import `BarcodeScanner` and the custom food fetching pattern from AddFoodScreen

## Part 2: Fix Custom Food Logging (the 14,400 cal / 0 cal bug)

**Root cause**: `logCustomFood()` in AddFoodScreen logs with `food_item_id: null`. The food's macros are stored as per-serving totals (e.g., 120 cal for 240ml). EditFoodModal then uses `serving_size: 1` as base, making all multiplier math wrong.

**Fix in `src/components/nutrition/AddFoodScreen.tsx` — `logCustomFood()`**:
- For foods from `client_custom_foods`: look up or create a matching `food_items` row, then set `food_item_id` on the nutrition_log. This ensures EditFoodModal can load correct base macros
- Alternatively (simpler): set `food_item_id` to the custom food's corresponding `food_items` ID if it exists, since `CustomFoodCreator` saves to `food_items`

**Fix in `src/components/nutrition/EditFoodModal.tsx`**:
- When `food_item_id` is null (truly custom), store the original logged macros as the "1 serving" base and use a serving-based multiplier, not grams
- When `food_item_id` exists but `serving_unit` is non-gram (ml, cup, etc.), use the serving_size as-is for proportional scaling rather than assuming grams
- Fix the initial quantity display: use `quantity_display` and `quantity_unit` from the log entry if available, instead of always computing from `servings * serving_size`

**Fix in `src/components/nutrition/DailyNutritionLog.tsx`**:
- Update display logic (line ~567) to handle "ml", "cup", "scoop" and other serving units — not just "g", "oz", "serving"

## Part 3: Ensure Quantity Adjustments Scale Macros Correctly Everywhere

Audit and confirm that these components already use per-100g scaling correctly:
- `CreateMealSheet.tsx` — uses `computeMacros()` with per-100g values (confirmed working)
- `MealPlanBuilder.tsx` — uses per-100g values (confirmed working)
- `FoodDetailScreen.tsx` — needs verification
- `EditFoodModal.tsx` — the primary broken component, fixed above

---

## Technical Details

### EditFoodModal rewrite approach:
```text
On open:
  1. If food_item_id exists → fetch food_items row
     - Store base macros AS-IS (per serving)
     - Set initial quantity from log's quantity_display/quantity_unit
     - Multiplier = quantity / serving_size (where serving_size respects unit)
  2. If food_item_id is null → use log's macros as "1 serving" base
     - Initial quantity = log's quantity_display or servings
     - Show unit as log's quantity_unit or "serving"
     - Multiplier = quantity (servings-based)

On quantity change:
  - Always recalculate from immutable base values × multiplier
```

### Files to modify:
1. `src/components/nutrition/CreateMealSheet.tsx` — add barcode + custom foods tabs
2. `src/components/nutrition/EditFoodModal.tsx` — fix scaling math + unit handling
3. `src/components/nutrition/AddFoodScreen.tsx` — fix `logCustomFood()` to preserve food_item_id
4. `src/components/nutrition/DailyNutritionLog.tsx` — fix unit display for non-gram units

