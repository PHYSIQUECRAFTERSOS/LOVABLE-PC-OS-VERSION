## Goal
On the coach dashboard, the "Completed Yesterday" and "Missed Yesterday" widgets should ignore any workout flagged as `is_accessory` (vacuums, stretches, mobility, etc.) — matching how `resolveDayType` already treats them.

## Where
`src/components/dashboard/CoachCommandCenter.tsx` — the Section 6 "Yesterday's Workout Results" block (around lines 395–445).

## Changes

1. **Pull `is_accessory` on the yesterday calendar query** (line 218):
   - Update `yesterdayCalReq` select to join the workout flag:
     `select("user_id, target_client_id, linked_workout_id, is_completed, title, workouts:linked_workout_id(is_accessory)")`

2. **Pull `is_accessory` on the workout_sessions query** (line 214):
   - Extend the nested select: `workouts:workout_id(name, is_accessory)`

3. **Filter both lists before pushing entries**:
   - In the workout_sessions loop that builds `completedYesterday`, skip rows where `s.workouts?.is_accessory === true`.
   - In the calendar-events loop, skip events where `ev.workouts?.is_accessory === true` for BOTH the completed and missed branches.

That single filter ensures an accessory workout never produces a "Congrats" row, never produces a "Check In" missed row, and (since accessory days don't count as training days) won't inflate the missed count.

## Out of scope
- Compliance percentage math, leaderboard, at‑risk logic, and the per-client missed‑workout chip ("2 missed workouts" on the Jordan Carmean row at the top) — the user only asked about the Completed/Missed Yesterday cards. Will leave those unchanged unless they ask.
