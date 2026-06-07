## Goal

Accessory workouts (vacuums, stretches, mobility) should:
- ✅ Still appear in Today's Actions and be loggable
- ❌ Never flip the day to "Training Day" for nutrition macros
- ❌ Never award XP or count for challenges (already done)
- ❌ Never display a "Day N:" prefix on the Calendar — even on legacy events

## Root causes found

1. **"Training Day" still shows on accessory-only days** — Most `Vaccum` workout rows in the database still have `is_accessory = false`. The day-type logic is correct; the data flag just isn't set on every duplicate template. Marking one "Vaccum" template as accessory doesn't propagate to the other duplicates.
2. **"Day 6: Vaccum" on Calendar** — Calendar.tsx strips the "Day N:" prefix for accessories when *recomputing* labels from the active phase, but legacy `calendar_events.title` rows still contain the old "Day N: Vaccum" string. When the workout isn't in the currently-active phase's program_workouts (because it was a one-off schedule or older phase), the code falls back to `event.title` and shows the stale label.

## Changes

### 1. Data migration — flag all accessory-like workouts

Run a one-time migration to set `is_accessory = true` on all workouts whose name matches accessory patterns (vacuum/vaccum/stretch/mobility/foam roll/posture). This catches the duplicates that were never manually flagged.

```sql
UPDATE public.workouts
SET is_accessory = true
WHERE is_accessory = false
  AND (
    name ILIKE '%vacuum%' OR name ILIKE '%vaccum%' OR
    name ILIKE '%stretch%' OR name ILIKE '%mobility%' OR
    name ILIKE '%foam roll%' OR name ILIKE '%posture%'
  );
```

You'll be able to review the migration before it runs.

### 2. Calendar — always strip "Day N:" prefix from accessory events

In `src/pages/Calendar.tsx` (around line 225-263), when an event resolves to `isAccessory = true`, override the title to just the clean workout name regardless of what's stored in `event.title` or whether the workout is in the current phase's label map. This fixes legacy events with stale "Day 6: Vaccum" titles.

Also change the description from "Complete your scheduled workout" → "Recovery task" for accessory events so it visually reads as a non-training item (matches the Photos / Recovery day style in your screenshot).

### 3. TodayActions — same title cleanup for accessories

In `src/components/dashboard/TodayActions.tsx`, mirror the same logic: when `workoutAccessoryMap.get(workoutId)` is true, drop any "Day N:" prefix from the displayed title and use "Recovery task" subtitle.

### 4. (Optional polish) Visual differentiation

Render accessory workout cards on the Calendar with the same muted/recovery styling as the "Photos — Recovery day" item (no gold workout border), so they read as activities rather than training days.

## Files touched

- `supabase/migrations/...` — bulk-flag accessory workouts (migration tool)
- `src/pages/Calendar.tsx` — force accessory title override + recovery subtitle
- `src/components/dashboard/TodayActions.tsx` — same title/subtitle treatment
- `src/components/calendar/CalendarDayList.tsx` — accessory styling (if needed)

## What's NOT changing

- `resolveDayType` (already correct)
- XP / challenge scoring (already skips accessories)
- Workout logging behavior — accessories still log via the normal flow

## Open question

Do you want **future** workouts named like vacuum/stretch/mobility to be **auto-flagged as accessory on creation**? If yes, I'll add a trigger or a default in the workout builder. If you'd rather keep it manual, I'll leave creation as-is.
