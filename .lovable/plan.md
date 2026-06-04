## Goal

Allow you to schedule low-intensity items (Vacuum, stretches, mobility) on a client's calendar that:
- Use the existing workout builder + logger (so you keep one tool)
- Do NOT mark the day as a training day for nutrition macros
- Do NOT award XP / count toward workout compliance or streaks
- Show on dashboard + calendar without the "Day N:" prefix, with a distinct look
- Stop being filtered out by the dashboard's "dedupe workouts" logic (current bug: only one workout per day shows)

## Root cause of "Day 6: Vacuum missing"

`src/components/dashboard/TodayActions.tsx` lines 237-245 deliberately removes every workout after the first when 2+ are scheduled the same day. That's why Pull Day B shows and Vacuum doesn't. We'll change dedupe so accessory items always pass through, and only true duplicates (same `linked_workout_id`) collapse.

## Design

### 1. Data model — single flag

Add one boolean to `workouts`:

```text
workouts.is_accessory   boolean  NOT NULL DEFAULT false
```

Why on `workouts` (not on `program_workouts` or `calendar_events`):
- A "Vacuum" workout is inherently accessory wherever it's scheduled
- The flag propagates automatically when you copy the program, reschedule, or assign to new clients
- Calendar events already carry `linked_workout_id` so we can join to read it

No data backfill needed — existing workouts default to `false` (normal workout behavior preserved).

### 2. Coach-side: mark a workout as accessory

In the workout builder (where you set name/exercises), add a single toggle:
- Label: **"Accessory / Activity (no XP, no training-day macros)"**
- Help text: *"Use for stretches, mobility, posing, vacuums. Won't be numbered as Day X and won't trigger training-day calories."*

Also auto-set this when you use the existing `exclude_from_numbering` flag on `program_workouts`, OR keep them independent — see open question below.

### 3. Behavior changes (gated on `is_accessory`)

| System | Normal workout | Accessory workout |
|---|---|---|
| Calendar event `event_type` | `workout` | `workout` (unchanged — still uses workout infra) |
| Title format | "Day 4: Pull Day B" | Raw name, e.g. "Vacuum" or "Hip Mobility" |
| Dashboard list | Dumbbell + blue/gold bar | Distinct icon (Activity / Sparkles) + neutral gray bar |
| Dashboard dedupe | Collapses to one | Always shown, separately from main workout |
| `resolveDayType` | Marks day as training | **Ignored** — day stays rest if no other real workout |
| XP on completion | Awarded | None |
| Workout streak (`get_workout_streak`) | Counts | Skipped |
| Compliance ratio | Counts | Skipped |
| Workout numbering trigger (`sync_phase_labels_on_reorder`) | Numbered | Already skipped if `exclude_from_numbering=true`; we also skip if `workouts.is_accessory=true` |

### 4. Files touched

```text
DB migration
  - ALTER TABLE workouts ADD COLUMN is_accessory boolean default false
  - Update sync_phase_labels_on_reorder + sync_workout_name_to_calendar
    so accessory workouts get raw names (no "Day N:" prefix) on calendar
  - Update get_workout_streak to filter out sessions whose workout is_accessory

Backend logic
  - src/utils/resolveDayType.ts
      Join calendar_events -> workouts; exclude is_accessory when deciding training_day

Coach builder
  - src/components/WorkoutBuilder.tsx (or wherever name/phase is set)
      Add "Accessory / Activity" toggle bound to workouts.is_accessory

Client dashboard
  - src/components/dashboard/TodayActions.tsx
      a) Fetch workouts.is_accessory along with linked_workout_id
      b) Skip accessory items from the dedupe block (lines 237-245)
      c) Render with a different icon + muted bar; label = raw workout name
      d) Add a new ActionItem subtype "activity" so PRIORITY_ORDER skips it
  - src/components/dashboard/CoachPriority.tsx
      Don't surface accessory items as "Priority Today"

Calendar
  - src/components/calendar/*  (event chip rendering)
      If linked workout is_accessory, render gray "Activity" pill (no Day N)

Workout logger / completion
  - src/components/WorkoutLogger.tsx
      On finish: if workout.is_accessory, skip PR recompute, XP award,
      challenge auto-score, streak update. Still mark calendar_event completed
      so it ticks off in Today's Actions.
```

### 5. UX details for dashboard (matches your screenshots)

Today's Actions item for an accessory:

```text
[ ◯ ] [activity icon]  Vacuum
                       Activity · not counted as a workout
```
- Bar color: muted gray (`bg-muted-foreground/30`)
- No "Day 6:" prefix
- Tapping still opens the workout logger so the client can check it off

## Open question

When you schedule a normal workout AND an accessory on the same day (e.g. Pull Day B + Vacuum), do you want:

- **A.** Accessory always shows as a separate row below the main workout (recommended, matches Trainerize), OR
- **B.** Accessory is grouped/folded into the main workout card as a sub-item

Default in this plan is **A**.

## Out of scope (ask if you want them)

- Bulk-converting existing workouts to accessory (you'd flip each one in the builder)
- Adding a brand-new `event_type = 'activity'` (we're reusing `workout` to avoid a much larger refactor of calendar, completion, RLS, scheduling dialogs)
