## Goal
On the Nutrition → **Meal Plan** tab, auto-open the day that matches today's calendar (Training Day if a workout is scheduled today, Rest Day otherwise) instead of always defaulting to the first day.

## Where the bug is
`src/components/nutrition/ClientStructuredMealPlan.tsx`

- Lines 119–146 already detect today's workout and set `activeDayType`, but only when the coach built **multiple separate plans** (one per day_type). For Kevin's setup ("KEVIN WU 2026 NUTRITION") there is **one plan** with two days inside it labeled `training` / `rest` — so this branch never matches the actual day pills.
- Lines 156–164 then auto-select `activeDays[0]`, which is always the first day ("training"), regardless of whether today is a rest day.

## Fix (single file, presentation only)

1. Always run the calendar check on mount (today's date only, per your answer) — independent of `plans.length`.
2. After `activeDays` is computed, when selecting the initial day, instead of blindly picking `activeDays[0]`:
   - If `todayIsTraining === true`, pick the first day whose `day_type` (normalized lowercase) contains `"training"` or `"workout"`.
   - If `todayIsTraining === false`, pick the first day whose `day_type` contains `"rest"`.
   - Fall back to `activeDays[0]` if no label match is found (preserves current behavior for plans without labeled days).
3. Only apply this auto-pick on the initial mount / when plans first load — don't override the user if they manually tap a different day pill afterward (guard with a `hasAutoPickedRef`).
4. Keep the existing multi-plan `activeDayType` selection logic unchanged.
5. Do NOT touch the "Copy from meal plan" button logic — it already works.

## Verification
- Read final file to confirm no behavior change for coaches with multi-plan setups.
- Manual smoke: open Meal Plan tab on a rest day → "rest" pill is preselected; on a training day → "training" pill is preselected; tapping the other pill still works and sticks.

No DB changes, no new components, no styling changes.