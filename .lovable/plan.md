

## Diagnosis

**Console error**: `new row violates row-level security policy for table "program_workouts"` at `handleWorkoutSaved`.

The `handleWorkoutSaved` function in `ProgramDetailView.tsx` has two code paths:
1. **Direct INSERT** (line 572) — when the phase already has a DB `id`, it tries inserting a `program_workouts` row directly. This path is failing with an RLS error.
2. **Full save via `saveProgramWithPhases`** (line 587) — when the phase is new (no `id`), it deletes all phases and recreates them. This path works (confirmed by 201 responses in network logs).

The RLS policy on `program_workouts` validates that the `phase_id` belongs to a program owned by the current coach. I verified the data is correct — the phase exists, belongs to the right program, owned by the authenticated coach. However, the direct INSERT fails intermittently, likely due to a **stale phase ID** after `saveProgramWithPhases` previously deleted and recreated phases with new IDs, combined with React closure timing.

When the direct insert fails:
- The WorkoutBuilderModal already showed "Workout created" (workout saved to `workouts` table)
- `handleWorkoutSaved` optimistically added the workout to local state
- But `loadProgram()` is never called (error thrown before reaching it)
- The error toast fires but may be missed by the user
- The workout appears briefly in local state but is NOT persisted as a `program_workouts` link
- On any reload/navigation, the workout disappears

**For the "add phase" scenario**: Adding a new phase calls `saveProgramWithPhases` which deletes ALL existing phases/workouts and recreates them. If this fails partway through, everything disappears because the old data was already deleted.

## Fix Plan

### 1. Make `handleWorkoutSaved` resilient (ProgramDetailView.tsx)
- When the direct INSERT into `program_workouts` fails, **fall back to `saveProgramWithPhases`** instead of just showing an error
- Always call `loadProgram()` after ANY save attempt (success or failure) to keep UI in sync with DB
- This ensures the user never sees a "ghost" workout that isn't persisted

### 2. Fix the `editingWorkout` check bug (ProgramDetailView.tsx)
- `editingWorkout` is set to `null` at line 562 BEFORE the try/catch block checks it at line 571. This means the `!editingWorkout` check at line 571 is ALWAYS true, even when editing. The `setEditingWorkout(null)` call needs to move AFTER the DB operations.

### 3. Ensure `saveProgramWithPhases` doesn't delete before confirming it can insert
- Currently it deletes all phases first, then inserts. If the insert fails, everything is lost. Add error recovery by catching insert failures and re-fetching.

**Files affected**: `src/components/training/ProgramDetailView.tsx` only.

**No database changes needed** — the RLS policies are correct; the issue is in the client-side error handling and state management.

