# Fix AI Import — Empty Phases / Zero Workouts

## Problem (verified in DB)

Recent AI imports create the `programs` row and `program_phases` row, but the phase ends up with **zero `program_workouts`** and often zero fresh `workouts`. Example: job `87811272` (today 21:32) created "Phase 6" at 21:34, but no workouts or program_workouts were inserted afterward. Job stays stuck at `status = 'importing'` with an empty `error_message`, which means `saveWorkoutProgram` aborted silently mid-flight and the modal's `catch` recorded an empty message.

Two things go wrong inside `AIImportModal.saveWorkoutProgram` (`src/components/import/AIImportModal.tsx`):

1. **Master-workout "reuse" path is destructive and silently fails.** When the AI job returns `master_workouts` matches (existing library workouts with the same `day_name`), the code hits an existing `workouts` row and:
   - `DELETE FROM workout_exercises WHERE workout_id = master.id`
   - `UPDATE workouts SET description = ... WHERE id = master.id`
   - re-inserts all exercises against the master workout id
   
   That mutates the workout row Phase 1 already points to, and for non-owner coaches (managers, staff coaches) the DELETE/UPDATE are blocked by RLS and return `{ error }` without throwing. The loop continues, `workoutIdByName` gets set to the master id, but subsequent `program_workouts` insert can still fail. In the observed 21:32 job, 3 of 5 days matched masters (so no new workouts row was ever inserted for them) and the loop never produced valid `workout_id`s for the other 2 either — result: 0 workouts, 0 exercises.

2. **All Supabase writes fail silently** (`console.error` + `continue`). No count of failed inserts is bubbled up, so `saveWorkoutProgram` returns `{ dayCount: 0, exerciseCount: 0 }` and the caller marks the job "done" and toasts "Saved 0 workout days with 0 total exercises" — or hangs at "importing" because the user closed the modal while the extremely long sequential loop was still running.

Coach/manager reports match this: managers hit RLS on the shared master rows and get nothing; Kevin (admin) sometimes wins the race, sometimes not.

## Fix

### 1. Stop mutating master workouts — always clone (`AIImportModal.tsx`)

Remove the "reuse master shell" branch inside the `uniqueWorkouts` loop. Every imported day becomes a **fresh `workouts` row** owned by the current user, exactly like the manual "Copy Day to Client" path already does via `cloneWorkoutHelpers.ts`. This eliminates the RLS DELETE/UPDATE on rows the coach doesn't own and prevents Phase N imports from wiping the exercises of a workout Phase 1 already references.

### 2. Use the proven exercise-insert path

Replace the ad-hoc `insertExercisesForWorkout` loop with `replaceWorkoutExercisePlan` from `src/lib/workoutExerciseQueries.ts` (already used by clone helpers). It writes exercises in a single RPC round trip, respects RLS via `SECURITY DEFINER`, and returns a definitive count so we can detect partial writes.

### 3. Surface every failure

- After each `workouts` insert, throw if `{ error }` or no row returned. Do the same for each `program_workouts` insert.
- Collect per-day results (`{ dayName, exercisesExpected, exercisesCopied, errors[] }`) with the existing `buildImportSummary` / `formatImportSummary` helpers from `cloneWorkoutHelpers.ts`.
- If **zero** workouts landed, throw so `confirmAndSave` marks the job `failed` with a real `error_message` and the user sees a red toast instead of a silent success.
- If some days succeeded and some failed, keep the job `done` but show the warning summary (same UX as the existing master-import path).

### 4. Prevent premature modal dismissal

Guard the "saving" step so the modal can't be closed mid-save (disable the sheet's close/overlay handlers while `step === "saving"`). The current UI lets the user dismiss during the long sequential loop, leaving orphan phases behind.

### 5. Grant managers the RLS they actually need

Add matching `manager` policies so team coaches with the `manager` role can complete an import end-to-end:

- `program_workouts` — INSERT/UPDATE/DELETE when the parent program's `coach_id = auth.uid()` OR user has `manager` role on any phase they own.
- `program_phases` — INSERT/UPDATE when user has `manager` role and owns the parent program.
- Keep existing coach/admin policies untouched (additive only, per project rules).

### 6. Backfill cleanup

One-time migration to delete the orphan phases created today with zero `program_workouts` (`Phase 2`, `Phase 3`, `Phase 6` for the affected programs) so the UI stops showing empty shells. Programs, workouts, and unrelated phases are left untouched.

## Verification

- Re-run the failing import (5-day home workout PDF) as admin — expect a fresh program with 5 workouts and all exercises attached.
- Re-run as the manager coach account — expect the same result, no silent RLS drops.
- Kill the modal mid-save — expect it to refuse to close and the job to complete (or fail loudly with a visible error, not stay `importing`).
- Confirm no existing master workouts were mutated by the import (compare `updated_at` on prior masters before/after).

## Files touched

- `src/components/import/AIImportModal.tsx` — rewrite `saveWorkoutProgram`, guard modal dismissal, use clone helper + summary formatter.
- `supabase/migrations/<new>.sql` — add manager RLS policies on `program_workouts` and `program_phases`; delete today's empty orphan phases.

No changes to the AI extraction / matching pipeline — that part is working per user report.
