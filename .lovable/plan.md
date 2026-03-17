

# Nutrition UX Overhaul: Create Meal, Save from Tracker, Custom Foods

## Three Features

### 1. Create Meal — Quantity Editing + Macro Display
**Problem**: `CreateMealSheet.tsx` adds foods with fixed quantity/macros from `addFoodToStaged()` (line 77-91). No way to adjust quantity or see updated macros per item.

**Fix**: Add per-item quantity editing and live macro recalculation in CreateMealSheet:
- Add `serving_size` (base) to `StagedItem` interface so we can compute multiplier
- For each staged item row, show an inline quantity input + serving unit label
- When quantity changes, recalculate that item's macros: `newCals = baseCals * (newQty / baseQty)`
- Show per-item macros in the row (cal · P · C · F)
- Add an "edit" tap that expands the item inline with quantity/unit controls (similar to FoodRow's expanded state)
- Allow item removal (already works) and reordering is not needed

### 2. "Save Meal from Tracker" (MFP Edit Diary style)
**Problem**: No way to select logged foods in the tracker and save them as a meal.

**Fix**: Add an "Edit" mode to `DailyNutritionLog.tsx`:
- Add an "Edit" button in the date navigation header (top-left area)
- When in edit mode, show checkboxes next to each food entry (per meal section)
- Show a sticky bottom bar with "Save Meal" button (+ item count badge)
- Tapping "Save Meal" opens a mini dialog/sheet: meal name input + list of selected items with macros
- On save, insert into `saved_meals` + `saved_meal_items` using the selected log entries' data
- "Cancel" exits edit mode, deselects all

Also fix `SavedMealDetail.tsx` for editing quantities:
- Currently only allows renaming and deleting items, not editing quantities
- Add per-item quantity editing: tap an item to expand inline editor with quantity input + live macro recalc
- On save, update `saved_meal_items` row and recalculate parent `saved_meals` totals
- Fix the bottom button being cut off: already has `pb-[calc(1rem+env(safe-area-inset-bottom))]` but the content area uses `pb-32` which may not be enough — increase to `pb-36` for safety

### 3. Client Custom Food Creator + Custom Foods Tab
**Problem**: `CreateFoodScreen.tsx` exists but is only used in the coach meal plan builder. Clients have no way to create custom foods or browse them.

**Fix in `AddFoodScreen.tsx`**:
- Add a "Custom" button next to the Barcode quick action card (in the top action row, replacing the 3-column grid with 4 columns: Barcode, Meal Scan, Quick Add, + Custom)
- Add a new tab `"custom"` after "My Meals": `{ key: "custom", label: "Custom Foods" }`
- The Custom tab shows all `client_custom_foods` for the current user, fetched on tab activation
- Each row shows name, brand, macros, with tap-to-log and long-press to edit/delete
- The "Custom" quick action button opens `CreateFoodScreen` (already built)
- After creating a custom food, it appears in the Custom tab and is also searchable in All tab

**Custom food logging**: When user taps a custom food to log it, insert into `nutrition_logs` with `custom_name` = food name, macros from the custom food row. No `food_item_id` needed (these aren't in `food_items`).

## Files to Change

| File | Changes |
|------|---------|
| `src/components/nutrition/CreateMealSheet.tsx` | Add `serving_size` to StagedItem, per-item quantity editing with live macro recalc, update totals dynamically |
| `src/components/nutrition/SavedMealDetail.tsx` | Add per-item quantity editing (expand inline), update item + parent totals on save, ensure bottom button visible with safe area |
| `src/components/nutrition/DailyNutritionLog.tsx` | Add "Edit" mode with checkboxes, sticky "Save Meal" bar, meal creation from selected items |
| `src/components/nutrition/AddFoodScreen.tsx` | Add "Custom" quick action + "Custom Foods" tab, fetch/display `client_custom_foods`, log custom foods, wire up CreateFoodScreen |
| `src/components/nutrition/CreateFoodScreen.tsx` | Minor: add fiber/sugar/sodium fields (currently missing), ensure it works as a sub-screen within AddFoodScreen |

## Implementation Order
1. CreateMealSheet quantity editing (unblocks meal creation UX)
2. SavedMealDetail quantity editing (unblocks meal management)
3. DailyNutritionLog edit mode + save meal flow
4. AddFoodScreen custom food tab + CreateFoodScreen integration
5. Code analysis pass for bugs and edge cases

