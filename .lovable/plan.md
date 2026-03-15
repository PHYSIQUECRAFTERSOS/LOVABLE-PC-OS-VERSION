

# Natural Serving Units in Meal Plan Builder + Custom Food Unit Options

## Problem
1. **Meal Plan Builder** always shows foods in grams (e.g., "50g" for an egg). It should display natural serving units when available (e.g., "1 egg", "1 banana", "1.5 bagels").
2. **Custom Food Creator** hardcodes `serving_unit: "g"`. Coaches need options like bar, bottle, unit, cup, ml, oz, scoop, slice, tsp, tbsp.

## Approach

### MealPlanBuilder.tsx
- Add `serving_unit` and `serving_size_g` (grams per 1 unit) to the `MealFood` interface
- `gram_amount` remains the internal value for all macro calculations (unchanged math)
- When a food is added via `addFoodToMeal`, capture the food's `serving_unit` and `serving_size` from the search result
- **Display logic**: If `serving_unit !== "g"`, show quantity as `gram_amount / serving_size_g` and the unit label. If "g", show raw grams as today.
- **Input logic**: When coach types a quantity (e.g., "2"), update `gram_amount = quantity * serving_size_g`
- Update the food row to show the unit label instead of hardcoded "g"
- When loading existing plans, preserve serving unit from stored food item data

### CustomFoodCreator.tsx
- Replace the hardcoded `serving_unit: "g"` with a `Select` dropdown
- Options: g (default), bar, bottle, unit, cup, ml, oz, scoop, slice, tsp, tbsp
- Add `servingUnit` state, pre-fill from `editFood.serving_unit` when editing
- Save the selected unit to the `serving_unit` field in the payload

### No database changes needed
The `food_items.serving_unit` column already exists as a text field and accepts any string value.

## Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/MealPlanBuilder.tsx` | Add serving_unit/serving_size_g to MealFood, update addFoodToMeal, display, and input logic |
| `src/components/nutrition/CustomFoodCreator.tsx` | Add serving unit Select dropdown with 12 options |

