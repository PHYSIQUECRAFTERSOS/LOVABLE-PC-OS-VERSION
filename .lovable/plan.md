# Three Fixes: FAB Position + Meal-Plan Unit Consistency + Zero-Macro Bug

## 1. Lift the Quick-Log "+" FAB (and BodyStats add button) off the bottom nav

**Problem:** On iPhone 16 Pro the floating `+` button on the home screen sits visually on top of (and is partially clipped by) the bottom tab bar. Same issue on the BodyStats add button you tap into from the FAB.

**Fix (visual only, no logic):**

- `src/components/dashboard/QuickLogFAB.tsx` — bump the mobile bottom offset from `bottom-20` to `bottom-28` and add safe-area padding so it respects the home-indicator inset on iOS:
  - `fixed right-5 z-50 ... md:bottom-6` → `fixed right-5 z-50 ... md:bottom-6 bottom-28` plus `style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom))' }}` on mobile (kept inline so it only applies under the `md` breakpoint via class override).
- Same treatment for the inner add button surfaced by the BodyStatsPopup / PhotosPopup entry points if they share the same anchor.

This gives the dead space Johan asked for, on every iPhone size, without breaking desktop.

## 2. Meal-plan unit display must mirror the coach builder ("2 units", not "2g")

**Problem:** Coach builds a meal in `MealPlanBuilder` with `serving_unit="unit"` (e.g. Caramel Rice Cake = 2 units). The client app shows it as `2g` because `ClientStructuredMealPlan.tsx` line 481 hardcodes `{item.gram_amount}g`.

**Fix:** Replace the hardcoded `{gram_amount}g` with the shared `formatServingDisplay()` helper that's already used in the tracker — it correctly renders `2 units`, `0.5 banana`, `125g`, etc., based on `serving_unit` + `serving_size`.

- `src/components/nutrition/ClientStructuredMealPlan.tsx` (line ~481): swap the span for `formatServingDisplay({ serving_label: item.serving_unit, serving_size: item.serving_size }, item.gram_amount, item.serving_unit, 1)`.
- Audit `ClientMealPlanView.tsx` for the same hardcoded `g` and apply the same helper.

This is display-only — no DB writes, no macro changes.

## 3. Banana (0.5 unit) saving as 0 cal / 0P / 0C / 0F

**Root cause:** In `MealPlanBuilder.tsx` the macros are stored as

```
calories: (food.cal_per_100 * food.gram_amount) / 100
```

When a coach added the banana, `food.serving_size_g` was 0 / missing (custom food or a food row without a serving size). The UI's `useNatural` check (`food.serving_size_g > 0`) then defaulted to treating typed `"0.5"` as grams, so `gram_amount = 0.5`. Macros = `(per_100 × 0.5)/100` → rounds to 0 across the board. The "2g" rice-cake row is the same shape (gram_amount was stored as the unit count, not real grams).

**Fix (writes correct data going forward, doesn't touch existing rows):**

- In `MealPlanBuilder.tsx` when a food is added, guarantee `serving_size_g` is a positive number. If the food has `serving_unit !== "g"` but no usable per-serving grams, fall back to either (a) the food's known per-serving grams from `food_items`, or (b) force `serving_unit = "g"` so the unit/grams math stays consistent.
- Compute saved macros from the actual quantity in the chosen unit, not from a possibly-zero `gram_amount`. Concretely: derive `units = gram_amount / serving_size_g` (when natural) and store `calories = per_serving_cal × units` (and same for P/C/F). For pure-gram foods keep the existing per-100 math.
- Same treatment in the second save path around line 929 (the "save as template" branch uses the same pattern).
- Display in the builder already handles `useNatural` correctly, so no UI change there.

**Existing bad rows:** I will *not* auto-rewrite Kevin's existing data. You can re-open the affected meal in the builder and re-save to fix it, or I can add a one-off repair script — say the word.

## Out of Scope

- No backend / RLS / migrations.
- No changes to the auto-track flow itself (that was already fixed last round).
- No changes to the tracker's display logic — it already uses `formatServingDisplay`.

## Clarifying Question

For the banana / rice-cake foods you already saved, do you want me to (a) just fix the bug going forward so any *new* foods saved are correct (you re-save the affected meal once), or (b) also add a one-time repair pass that recomputes macros + grams for existing `meal_plan_items` rows where `serving_unit != 'g'` and macros look broken? yes . fix the bug going forward so any new foods saved are correct and add a one time reapir pass that recomputes macros + grams for exisiting here it looks broken