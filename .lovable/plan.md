# Fix: "Copy from Meal Plan" on Nutrition Tracker

## Problems

1. **Wrong day type copied.** On a rest day, the button silently copies the Training Day plan because `resolvedPlanData` falls back to `"all_days"` or the first plan in the list when no matching plan exists.
2. **Wrong meal copied.** Tracker "Meal 3" maps to the plan's 3rd meal by `sort_order` position. When the coach's plan order doesn't line up 1:1 with the tracker's Meal 1–6 grid, items from a different meal (e.g. supplement-only Meal 6) end up copied into Meal 3.

## Changes

All edits in `src/components/nutrition/DailyNutritionLog.tsx` (+ small helper in `src/hooks/useMealPlanTracker.ts`).

### 1. Day-type resolution for Copy
- Compute the plan used by "Copy from meal plan" strictly from the resolved `dayType` (from `resolveDayType`), independent of the visual pill the user has selected for browsing.
- Lookup order:
  1. Plan with `day_type === "rest"` if it's a rest day, else `"training"`.
  2. If missing, plan with `day_type === "all_days"`.
  3. If still missing, the opposite-day plan (training fallback on rest day).
- When step 3 is used, show a warning toast: *"No Rest Day meal plan — copying from Training Day plan."* (and reverse for the other direction).
- If no plan exists at all, keep the existing "Meal plan items not available" message.

### 2. Match meals by exact name
- Change `getItemsForMealSection` (and the subtitle helper `getCoachMealNameAtPosition`) to first attempt an **exact name match**: e.g. tracker `meal-3` ⇒ plan items where `meal_name` equals `"Meal 3"` (case/whitespace-insensitive).
- If no exact match is found for that slot in the chosen plan, fall back to the existing position-ordered behavior so plans that use custom names ("Breakfast", "Lunch"…) keep working.
- Supplement items are included as-is (no filtering).

### 3. UX polish
- Success toast already shows "Training Day plan loaded" / "Rest Day plan loaded" — update the label so it reflects the **actual plan copied from**, not `activePlanDayType` (which is the browsing pill).
- `hasPlanItems(mealKey)` uses the same resolved plan so the button hides correctly when the rest-day plan truly has nothing for that meal.

## Files

- `src/components/nutrition/DailyNutritionLog.tsx` — new `copySourcePlanData` memo (day-type-driven), updated `handleCopyFromMealPlan`, `hasPlanItems`, toast labels.
- `src/hooks/useMealPlanTracker.ts` — `getItemsForMealSection` and `getCoachMealNameAtPosition` get exact-name-first matching for `meal-N` keys.

## Out of scope

- Coach-side meal plan builder UI.
- Supplement tab behavior.
- Any DB schema changes.
