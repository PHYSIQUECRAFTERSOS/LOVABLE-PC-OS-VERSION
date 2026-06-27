## Why it's broken

Most coaches build ONE `meal_plans` row containing multiple `meal_plan_days`, where each DAY carries its own `day_type` ("Training Day", "Rest Day", "training", "rest", etc.). The current resolver in `DailyNutritionLog.tsx` calls `getPlanByDayType("rest")`, which only looks at the **plan-level** `day_type` column. If the client only has one plan (day_type='training' on the plan row, but with both training & rest DAYS inside), the rest-day lookup falls through to the "opposite" fallback and copies the Training Day items — exactly the bug shown ("Copy from Rest Day plan" pulling training foods).

Verified in the database: e.g. plans like "Zane Karuna Meal plan", "Scott Szeto - PLAN", "Joshua Williams Back To ABS", "Johan Ramirez cutting plan" all have a single plan row (plan_day_type='training') containing BOTH a Training Day and a Rest Day in `meal_plan_days`.

## Fix

Resolve the copy source by scanning DAYS across all of the client's active plans, not plans.

### 1. `src/hooks/useMealPlanTracker.ts`
Add a helper `getDayByDayType(wantKey: "training" | "rest")` that:
- Normalizes `meal_plan_days.day_type` (lowercase; if it contains "rest" → "rest", contains "training" → "training", else "unknown").
- Returns the first matching `{ plan, day, items }` across all of the user's active plans, preferring a day whose parent plan's `day_type` also matches (stable ordering by plan `sort_order`, then `day_order`).
- Returns `null` when no day of that type exists anywhere.

### 2. `src/components/nutrition/DailyNutritionLog.tsx`
Replace the `copySourcePlanData` resolution:
- Primary: use new `getDayByDayType(wantKey)` to find the correct day.
- Secondary: only if NO day of the wanted type exists across all plans, fall back to the opposite (existing fallback toast already warns the user).
- Pass the resolved `day.id` directly into `getItemsForMealSection(...)` so items come from that specific day, regardless of which plan owns it.
- Update the button label logic to read from the new resolver (still shows "Copy from Rest Day plan" / "Copy from Training Day plan").

No DB changes; no UI redesign. Pure logic fix.

## Verification

- Re-read the file, run `tsgo --noEmit`.
- Spot-check with a SQL query for a couple of affected clients: confirm `getDayByDayType("rest")` would pick the actual Rest Day row.
- Drive Playwright on `/nutrition` if a logged-in client session is available; otherwise confirm via code trace + unit-level reasoning that on a rest day the button now reads from the Rest Day's `day_id`.
