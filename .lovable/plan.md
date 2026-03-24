

# Plan: Trainerize-Style "+" FAB with Quick Schedule Actions

## Summary

Replace the current QuickLogFAB (which only logs weight/steps) with a Trainerize-style FAB that opens a radial menu with four actions: **Workout, Cardio, Photos, Body Stats**. Each action opens a scheduling drawer that defaults to today but includes a calendar picker to schedule for a different date. Events are inserted into `calendar_events` just like the coach CalendarTab does.

## Visual Design

```text
        [X] ← closes/rotates back
         |
   ┌─────────────┐
   │ 🏋 Workout   │  (blue icon, rounded pill)
   │ 🏃 Cardio    │  (green icon)
   │ 📸 Photos    │  (orange/gold icon)
   │ 📊 Body Stats│  (teal icon)
   └─────────────┘
```

When tapping an action, a Drawer opens:

```text
┌──────────────────────────────────┐
│  Schedule Workout     📅 [Today] │  ← tap calendar icon to pick date
│                                  │
│  [Select workout dropdown]       │  ← for workout: shows assigned workouts
│  [Select cardio type dropdown]   │  ← for cardio: Running/Walking/etc.
│  (Photos/Body Stats: just date)  │
│                                  │
│  [Schedule]  [Cancel]            │
└──────────────────────────────────┘
```

## Changes

### 1. Rewrite `QuickLogFAB.tsx` → Trainerize-style FAB

**File: `src/components/dashboard/QuickLogFAB.tsx`**

Complete rewrite:
- Four actions with colored circular icons matching the app palette:
  - Workout (blue, `Dumbbell` icon)
  - Cardio (green, `Heart`/`Activity` icon)
  - Photos (gold/orange, `Camera` icon)
  - Body Stats (teal, `Activity`/`Scale` icon)
- Tapping an action opens a Drawer with:
  - Header showing action name + calendar icon button (top-right)
  - Default date: today, displayed as "Today" or formatted date
  - Calendar picker: tapping the calendar icon opens a `Popover` with `Calendar` component to pick a different date
  - **Workout**: loads the client's assigned workouts from `program_workouts` via `client_program_assignments`, shows a dropdown to pick one
  - **Cardio**: shows a dropdown of cardio types (Running, Walking, Cycling, Rowing, Elliptical, Stair Climbing, etc.) with optional notes field for incline/speed/duration
  - **Photos**: simple confirmation — schedules a "Take Progress Photos" event
  - **Body Stats**: simple confirmation — schedules a "Track Body Stats" event
- On "Schedule" button press:
  - Inserts into `calendar_events` with `user_id: