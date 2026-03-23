

# Plan: Fix 4 Nutrition Tracker Issues

## Issue 1: EditFoodModal — Show original serving size, not just g/oz

**Problem**: When you tap a logged food (e.g., "1 croissant"), the edit drawer only offers g and oz units. It should show the food's original serving unit (e.g., "serving" = 1 croissant = 67g).

**Fix in `src/components/nutrition/EditFoodModal.tsx`**:
- When loading from `food_items`, also fetch `serving_unit` and `serving_description`
- Add a "serving" button alongside g/oz that represents the food's natural unit (e.g., "1 croissant", "1 scoop")
- When "serving" is selected, quantity represents number of servings, multiplier = quantity directly
- Pre-select "serving" mode when `quantity_unit === "serving"` in the log entry

## Issue 2: Favorites star button not working for clients

**Problem**: When a client taps the star on a search result, `handleToggleFavorite` calls `toggle_food_favorite` with the food's ID. For non-local foods (from FatSecret/USDA), this ID isn't in `food_items`. When the Favorites tab loads, it queries `food_items` by those IDs and finds nothing.

**Fix in `src/components/nutrition/AddFoodScreen.tsx`**:
- In `handleToggleFavorite`, if the food is non-local (source !== "local"), first import it via `importOFFFood` to get a local `food_items` ID
- Then call `toggle_food_favorite` with the imported ID
- Update the item's ID in the results/favorites state so subsequent toggles use the correct ID

## Issue 3: Auto-dismiss "food logged" toast after 1 second

**Problem**: The "Chicken Breast logged" banner lingers indefinitely.

**Fix in `src/components/nutrition/AddFoodScreen.tsx`**:
- In `logFood`, `handleDetailConfirm`, `logSavedMealQuick`, `handleQuickAdd`, and `logCustomFood` — after calling `toast({ title: "...logged" })`, call `dismiss()` after 1 second using `setTimeout`
- Pattern: `const t = toast({ title: "..." }); setTimeout(() => t.dismiss(), 1000);`

## Issue 4: Display serving sizes properly in tracker (not "1 serving")

**Problem**: Logged foods show "1 serving" or raw grams like "3g" for eggs. Should show natural units like "120g", "1 egg", "3 eggs".

**Fix in `src/components/nutrition/DailyNutritionLog.tsx`**:
- Update the food entry display line (around line 603-606) to show:
  - If `quantity_unit` is "serving": show `{quantity_display} serving` (or fetch serving_description from food_items)
  - If `quantity_unit` is "g": show `{quantity_display}g`
  - If `quantity_unit` is "oz": show `{quantity_display} oz`
- Also enhance by loading `serving_description` from `food_items` for each logged item so we can show "1 croissant" instead of "1 serving"
- Add `serving_description` to the food_items fetch in `fetchLogs`

## Issue 5: Tab label changes in AddFoodScreen

**Fix in `src/components/nutrition/AddFoodScreen.tsx`**:
- Change TABS array:
  - `"★ Favorites"` → `"Favs"` (keep the star icon inline)
  - `"My Meals"` → render with line break: `"My\nMeals"` using `whitespace-pre-line` on the tab button

---

### Files to modify:
1. `src/components/nutrition/EditFoodModal.tsx` — Add serving unit option
2. `src/components/nutrition/AddFoodScreen.tsx` — Fix favorites import, auto-dismiss toasts, tab labels
3. `src/components/nutrition/DailyNutritionLog.tsx` — Better serving display with serving_description

