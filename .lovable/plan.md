

# Fix Three UX Issues: Body Stats Checkoff, Serving Display, Grams Input

## Issue 1: Body Stats not checking off on dashboard after submission

**Root cause:** The `/body-stats` page (BodyStats.tsx) navigates to `/dashboard` after saving (line 114), but doesn't invalidate the `today-actions` cache. The dashboard renders stale cached data showing the item as incomplete, even though the calendar event was updated in DB.

**Fix in `src/pages/BodyStats.tsx`:**
- After successful save and calendar event update, invalidate the `today-actions-${userId}-${date}` cache before navigating back
- Import `invalidateCache` from `useDataFetch`
- Call `invalidateCache(\`today-actions-${user.id}-${logDate}\`)` right before `navigate("/dashboard")`

## Issue 2: Foods logged in grams showing "1 serving" instead of "130g"

**Root cause:** The display logic in `DailyNutritionLog.tsx` lines 620-625 hits the `qu === "serving"` branch and shows "1 serving" when `count === 1`. This happens for foods where `quantity_unit` was saved as `"serving"` even though the user typed a gram amount. The deeper issue: when logging via `FoodDetailScreen` with `useGrams=true`, line 879 correctly saves `quantity_unit: "g"`. But the `logFood` path (line 572-573) passes `unit` which comes from the inline quick-log — if the serving unit from the food_item is something like `"g"` but the code maps it to `"serving"`, grams get lost.

However, looking at the screenshots, the real problem is the display logic: when `qu === "serving"` and there's no `serving_label`, and count is 1, it shows "1 serving" — but it should show the total weight in grams for meat/fish items. The fix: when `count <= 1` and the food has a gram-based serving (`si.serving_unit === "g"`), show the total weight in grams instead of "1 serving".

**Fix in `src/components/nutrition/DailyNutritionLog.tsx` (lines 620-629):**
- In the `qu === "serving" && si` branch (no serving_label), when the serving unit is grams, always show total weight in grams rather than "N servings"
- Change the logic: if `si.serving_unit` is `"g"` or `"ml"`, show weight (`totalWeight + unit`) regardless of count. Only show "N servings" for items with non-metric serving units (like "piece", "slice", etc.)

## Issue 3: Can't backspace to clear the grams input (stuck "0")

**Root cause:** In `FoodDetailScreen.tsx` line 315: `onChange={(e) => setCustomGrams(parseFloat(e.target.value) || 0)}` — the `|| 0` prevents the field from ever being empty. Same pattern used for `quantity` input on line 335.

**Fix in `src/components/nutrition/FoodDetailScreen.tsx`:**
- Change `customGrams` state from `number` to `string` type
- Use a string state for editing, parse to number only for calculations
- Allow empty string in the input, use `parseFloat(customGrams) || 0` only in the calculation expressions
- On blur, if empty, optionally reset to "0" or leave empty with placeholder

This follows the project's existing pattern documented in memory: "fields must not enforce a minimum value of '1' during editing; instead, they allow an empty state (displaying a muted '0' placeholder)."

## Files to Edit

1. **`src/pages/BodyStats.tsx`** — Add cache invalidation before navigate
2. **`src/components/nutrition/DailyNutritionLog.tsx`** — Fix serving display logic for gram-based foods
3. **`src/components/nutrition/FoodDetailScreen.tsx`** — Convert grams input to string state for natural editing

