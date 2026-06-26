## Goal
Make the client nutrition tracker visibly state whether today is a **Training Day** or **Rest Day**, and guarantee the per-meal "Copy from meal plan" button auto-pulls foods from the matching plan (training vs rest) inside a single multi-day meal plan — no manual tab switching.

## Current state (already in place)
- `src/utils/resolveDayType.ts` already detects training vs rest by scanning `calendar_events` for non-accessory workouts.
- `DailyNutritionLog.tsx` already computes `copySourcePlanData` for the per-meal "Copy from meal plan" button strictly from the calendar-resolved day type (training → training plan, rest → rest plan, with `all_days` and opposite-day fallbacks).
- Plan pills ("Training Day" / "Rest Day") already default to the resolved day type.

So the per-meal copy is *already wired correctly* — the user's pain is mostly **visibility** (they can't tell at a glance what day the app detected) and confirmation that the right plan is being pulled. We'll surface the detection clearly and label the action.

## Changes

### 1. Day-type badge at top of nutrition tracker
File: `src/components/nutrition/DailyNutritionLog.tsx`

Add a small pill/badge directly under the date header (above the macro rings) that shows:
- **Training Day** — gold background, `Dumbbell` Lucide icon
- **Rest Day** — neutral dark background, `Moon` Lucide icon

The value comes from the existing `dayType` (`resolveDayType`) state. Badge is read-only — purely informational. Coach view keeps existing behavior (no badge needed since coach can switch days freely).

### 2. Label the per-meal copy button with the source plan
Same file, around the "Copy from meal plan" button (line 734-745).

Update the button label to reflect which plan it pulls from, so the client sees that it's auto-pulling the correct day:
- Training day detected → "Copy from Training Day plan"
- Rest day detected → "Copy from Rest Day plan"
- Falls back to `all_days` → "Copy from meal plan"
- Falls back to opposite day (no matching plan exists) → "Copy from {Training/Rest} Day plan" with the existing warning toast preserved

Derived from `copySourcePlanData.wantKey` + `copySourcePlanData.source`, which already exist.

### 3. Light cleanup
- Ensure the badge is mobile-friendly (full visible at 375px width, no truncation).
- No changes to data fetching, no new tables, no schema work.
- No changes to the existing plan-pill nav (it stays so users can still preview the other day's plan if they want).

## Files touched
- `src/components/nutrition/DailyNutritionLog.tsx` (add badge, relabel copy button)

## Out of scope
- Coach-side meal plan builder.
- Any change to how meal plans are stored or how `resolveDayType` works.
- Schema/RLS changes.
