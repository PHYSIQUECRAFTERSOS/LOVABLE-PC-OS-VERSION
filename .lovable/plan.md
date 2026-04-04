

## Meal Reorder + Save-to-Library + Saved Meals Tab in Meal Plan Builder

### What Gets Built

**1. Meal Reorder Arrows (Up/Down)**
Add up-arrow and down-arrow buttons to each meal header bar in the Meal Plan Builder. Clicking swaps the meal with its neighbor in the array. First meal hides up arrow, last meal hides down arrow.

**2. "Save Meal to Library" via 3-dot Menu**
Add a `MoreVertical` (⋮) icon to each meal header bar. Clicking opens a dropdown with "Save Meal to Library". This saves the meal's name and all its foods (with per-100g data, gram amounts, serving info) into `saved_meals` + `saved_meal_items` tables, owned by the coach. A prompt dialog asks for the meal name (pre-filled with current meal name).

**3. "Saved Meals" Tab in FoodSearchPanel**
Add a new filter tab after "Generic" called "Saved Meals". When active, it fetches the coach's `saved_meals` with their `saved_meal_items`. Displays meal names with macro totals. Selecting a saved meal auto-populates ALL its ingredients into the current meal slot in the builder (not as a single food — as individual food items).

### Technical Details

**File 1: `src/components/nutrition/MealPlanBuilder.tsx`**
- Add `moveMeal(dayId, mealId, direction: "up" | "down")` — swaps meal positions in the array
- Add `saveMealToLibrary(dayId, mealId)` — prompts for name, inserts into `saved_meals` + `saved_meal_items`
- Add state: `saveMealDialogOpen`, `saveMealName`, `savingMealTarget`
- In meal header bar: add `ChevronUp`/`ChevronDown` buttons + `MoreVertical` dropdown with "Save Meal to Library"
- Modify `FoodSearchPanel` usage: pass a new `onSelectSavedMeal` callback that bulk-adds all foods from a saved meal

**File 2: `src/components/nutrition/FoodSearchPanel.tsx`**
- Add `"saved"` to `FilterTab` union type
- Add `{ key: "saved", label: "Saved Meals" }` to FILTERS array
- Add state: `savedMeals` array, loaded on mount from `saved_meals` + `saved_meal_items` where `client_id = user.id`
- Add new prop: `onSelectSavedMeal?: (foods: FoodResult[]) => void`
- When "Saved Meals" tab is active and a meal is clicked, call `onSelectSavedMeal` with all the meal's items converted to `FoodResult[]`
- Show meal name, food count, and total macros per saved meal row
- Add delete button on saved meals for cleanup

**Database: No new tables needed** — `saved_meals` and `saved_meal_items` already exist with all necessary columns including per-100g values.

### Improvements Included
- **Bulk ingredient insert**: Selecting a saved meal adds ALL ingredients at once (not one-by-one), saving significant time
- **Quantity preservation**: Saved meals store the exact gram amounts, so you get the same starting point and just adjust quantities per client
- **Delete saved meals**: Clean up old/unused meals from the library
- **Meal count badge**: "Saved Meals" tab shows count of available meals

### What Stays the Same
- All existing filter tabs (All, Favorites, Recent, Custom, Branded, Generic)
- Food search behavior and scoring
- Meal plan save/load logic
- Template and client assignment flows

