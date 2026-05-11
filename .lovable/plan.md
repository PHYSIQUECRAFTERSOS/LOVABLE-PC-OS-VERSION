## Goal
Make the coach's exact meal naming flow through to the client UI, and make the pre/post-workout subtitle truly dynamic (driven by the coach's text and the day type — never on rest days).

## Changes

### 1. Client meal plan view shows coach's exact wording
**File:** `src/components/nutrition/ClientStructuredMealPlan.tsx`

Currently each meal section renders the static `MEAL_SECTIONS` label ("Meal 1"…"Meal 6") and ignores whatever the coach typed. Update it to match the tracker pattern:

- Import `parseMealSubtitle` and `getCoachMealNameForPosition` from `useMealPlanTracker`.
- For each rendered section, look up the coach's actual `meal_name` for that day at the section's `position` (1–6).
- Render bold "Meal N" as today + below it, in small gold text (`text-primary/80`), the parenthetical the coach wrote — e.g. `(pre workout)`, `(post workout meal)`, `(snack)`, anything inside `( … )` in the coach name.
- If the coach typed no parenthetical, show no subtitle.

This means whatever the coach types in MealPlanBuilder ("Meal 5 (pre workout meal)", "Meal 3 (post workout)", "Meal 2 (oatmeal bowl)"), the client sees it verbatim.

### 2. Nutrition tracker subtitle becomes fully dynamic
**File:** `src/components/nutrition/DailyNutritionLog.tsx`

The tracker already uses `getCoachMealNameAtPosition` + `parseMealSubtitle` (lines 668–681), so dynamic subtitles already work for training days. Two fixes:

a. **Hide pre/post-workout subtitles on rest days.** Around line 671, after computing `subtitle`, suppress it when the resolved day is a rest day AND the subtitle matches pre/post workout wording:
```
const isRest = dayTypeKey === "rest";
const looksWorkoutTagged = subtitle && /pre[-\s]?workout|post[-\s]?workout/i.test(subtitle);
const visibleSubtitle = isRest && looksWorkoutTagged ? null : subtitle;
```
Then render `visibleSubtitle` instead of `subtitle`. Other parentheticals the coach types in a rest plan (e.g. "(snack)") still show.

b. **Don't fall back to the training plan for subtitle text on rest days.** In the `resolvedPlanData` memo (lines 115–131), when `dayTypeKey === "rest"` and no rest plan exists, do **not** fall back to `all_days` or the first plan for *subtitle resolution* — keep the macros fallback (so totals still display) but pass an empty `mealPlanItems` to `getCoachMealNameAtPosition` on rest days when there's no real rest plan. Implementation: derive a separate `subtitleItems` value that is `mealPlanItems` only when the resolved plan's `day_type === dayTypeKey`, else `[]`.

This guarantees: on a rest day, the client only sees pre/post-workout wording if the coach explicitly put it in the rest plan — and even then, rule (a) hides those two specific tags.

### 3. No DB / coach-side / edge-function changes
Coach already saves the full `meal_name` string into `meal_plan_items.meal_name`. No schema, RLS, or backend work needed.

## Out of scope
- No change to `MEAL_SECTIONS` keys or `mapMealNameToKey` (would risk breaking historical `nutrition_logs` rows).
- No change to MealPlanBuilder UX.
- No change to FoodLogger modal title (it's the add-food sheet, not the section header).

## Verification
- As coach: rename "Meal 4" → "Meal 4 (pre workout meal)" on the training plan. As client on a training day: meal plan view shows `Meal 4` + gold `(pre workout meal)`; tracker shows `Meal 4` + gold `(pre workout)`.
- Switch the calendar/day to a rest day with a separate rest plan that has no parentheticals: both views show plain `Meal 1…N` with no subtitles, even if the training plan has pre/post tags.
- Existing logged data still groups under the correct meal slot (no key changes).
