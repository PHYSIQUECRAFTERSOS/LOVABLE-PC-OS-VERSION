## Goal
Restore fast, reliable desktop training workflows for coaches and clients:
- Workouts opened from Calendar load exercises instead of timing out.
- Coaches can consistently see clients and create/edit training programs.
- Training pages stay fast on desktop by avoiding unnecessary large queries and serial request chains.

## Findings so far
- The backend health is good: database is up, low memory usage, low connections, no recent backend errors.
- The failing area is the training frontend/data path, not internet speed.
- The Calendar workout popup and coach workout preview both call `fetchWorkoutExerciseDetails()`.
- Current workout loading does multiple frontend requests and has broken retry behavior: the Retry buttons set local state but do not actually re-run the load.
- Several coach training actions don’t check or surface backend errors, so coaches can see silent failures when adding/copying/attaching workouts.
- Client roster loading is heavy and can look unstable because it fires multiple large queries after the initial roster query.

## Implementation plan

### 1. Make workout exercise loading fast and reusable
- Update `src/lib/workoutExerciseQueries.ts`:
  - Fetch `workout_exercises` plus the linked exercise fields in one optimized query instead of two sequential queries.
  - Add safe fallback behavior if joined exercise data is missing.
  - Keep the same return shape so Calendar, Training, preview, and logger code continue working.
  - Add optional abort support for callers.

### 2. Fix Calendar workout preview retry/loading
- Update `src/components/dashboard/WorkoutStartPopup.tsx`:
  - Replace the current one-shot effect with a real `loadWorkout()` callback and `retryNonce` state.
  - Add an AbortController timeout so a stuck request cancels cleanly.
  - Make Retry actually re-run the query.
  - Check and display errors from the session lookup too.
  - Keep Start Workout disabled only while the preview is loading.

### 3. Fix coach workout preview retry/loading
- Update `src/components/training/WorkoutPreviewModal.tsx`:
  - Use the same real retry pattern and abort timeout.
  - Check `workouts` query errors instead of silently ignoring them.
  - Avoid leaving the modal in a stale spinner/error state after reopening another workout.

### 4. Improve coach workout editor reliability
- Update `src/components/training/ClientWorkoutEditorModal.tsx`:
  - Check errors when loading workout details and exercise rows.
  - Add toast/error state on failed load instead of showing an empty workout as if it loaded.
  - Use local-date formatting for scheduled count date check.

### 5. Improve new/edit workout builder reliability
- Update `src/components/training/WorkoutBuilderModal.tsx`:
  - Check errors for library/workout/exercise loads and scheduled-count queries.
  - Surface failures with toast rather than silent failure.
  - Use local-date formatting for date checks.

### 6. Make coach training mutations fail visibly and refresh correctly
- Update `src/components/clients/workspace/TrainingTab.tsx` for key paths:
  - Duplicate workout
  - Move workout
  - Delete workout
  - Assign/import workouts
  - Add new workout attach to phase
- Add error checks after each mutation, show destructive toast on failure, and only show success after confirmed success.
- Keep optimistic UI where safe, but revert/refetch when the backend rejects a change.

### 7. Stabilize the clients roster speed/visibility
- Update `src/components/clients/SelectableClientCards.tsx`:
  - Use `Promise.allSettled()` for secondary metrics so one slow/blocked metric query does not wipe the whole roster.
  - Show the roster as soon as profile + assignment data is available, then load compliance/phase metadata independently.
  - Add error logging/toast for the base roster query if it fails.

### 8. Add targeted database performance indexes if missing
Create a safe additive migration only if needed after final code inspection:
- Composite index for `workout_exercises(workout_id, exercise_order)` to speed exercise loading.
- Composite index for `program_workouts(phase_id, sort_order)` and/or `program_workouts(week_id, sort_order)` to speed phase workout lists.
- No destructive schema changes.
- No RLS policy removal.

### 9. Verify the fix
- Use Playwright on desktop viewport to test:
  - `/clients/:clientId?tab=training` loads a program.
  - Opening a workout preview shows exercises quickly.
  - Edit Workout opens with exercises loaded.
  - Calendar workout preview loads and Start Workout opens the logger.
- Check console/network errors after the flow.
- Run focused tests/type checks where relevant.

## Files likely touched
- `src/lib/workoutExerciseQueries.ts`
- `src/components/dashboard/WorkoutStartPopup.tsx`
- `src/components/training/WorkoutPreviewModal.tsx`
- `src/components/training/ClientWorkoutEditorModal.tsx`
- `src/components/training/WorkoutBuilderModal.tsx`
- `src/components/clients/workspace/TrainingTab.tsx`
- `src/components/clients/SelectableClientCards.tsx`
- Possible migration under `supabase/migrations/` for additive indexes only

## Not changing
- No native mobile app changes.
- No auth rebuild.
- No destructive database changes.
- No removal of existing RLS policies without explicit approval.