## Goal
Allow editing the **weight** of a set after pressing "Log", matching the existing behavior for reps.

## Problem
In `src/components/workout/ExerciseCard.tsx`, after a set is logged (`log.completed === true`):
- Reps input stays editable (line 441–457) and persists via `onUpdateLog(setIdx, "reps", num)`
- Weight input is hard-disabled (line 432: `disabled={log.completed}`)

That asymmetry is why the user could fix reps but not weight on an accidentally-completed set.

## Change
Single file: `src/components/workout/ExerciseCard.tsx`

1. Remove `disabled={log.completed}` from the weight `<Input>` (line 432) so it stays editable post-log, exactly like reps.
2. Keep all existing weight handling (string buffer for trailing decimals, onChange/onBlur commit, BW handling). `onUpdateLog` already persists weight changes to the database the same way it persists reps changes — no logger/persistence changes needed.
3. Visual: the row's "completed" styling (green check + primary background) stays; only the input becomes interactive. Hide the small "Bodyweight" hint when completed (it's already gated on `!log.completed`).

## Out of scope (confirm if you want these too)
- Adding an "uncomplete set" button (the user's screenshot mentioned not being able to uncomplete a set, but the literal request is just weight editability).
- Changes to RPE, tempo, or rest-timer behavior.

## Verification
- Log a set with weight 100 × 10. Tap the weight field — cursor enters, value editable.
- Change to 105, blur. Confirm DB row in `workout_set_logs` updates (same path used by reps edits).
- BW exercise: completed set still shows "BW" placeholder behavior; editing to a number works.
