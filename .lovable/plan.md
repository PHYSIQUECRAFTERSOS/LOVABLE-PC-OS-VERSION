

# Fix Plan Targets Persistence and Sticky Sidebar

## Two Issues

### 1. Plan Targets Not Saving/Loading
The `meal_plans` table already has `target_calories`, `target_protein`, `target_carbs`, `target_fat` columns, but:
- `handleSave()` never writes `macroTargets` to these columns
- Template/plan loading never reads these columns back into `macroTargets` state

**Fix in `MealPlanBuilder.tsx`**:
- On save (both insert and update), include `target_calories: macroTargets.calories`, `target_protein: macroTargets.protein`, `target_carbs: macroTargets.carbs`, `target_fat: macroTargets.fat`
- On load (both `loadTemplate` and `loadExistingPlan`), read these columns and call `setMacroTargets()` with the saved values
- The select query for plans needs to include these 4 columns

### 2. Sticky Sidebar Not Sticking on Scroll
The sidebar has `sticky top-4` but the parent flex container needs `items-start` (align-items: flex-start) so the sticky child doesn't stretch to full height. Also add `self-start` on the aside.

**Fix in `MealPlanBuilder.tsx`**:
- Change the desktop flex container from `"flex"` to `"flex items-start"`

## Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/MealPlanBuilder.tsx` | Save/load macro targets to/from `meal_plans` table; fix sticky alignment |

