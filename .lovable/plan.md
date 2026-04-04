
Issue diagnosis

The reason “fix and retest” keeps getting stuck is that the app is not stuck in the UI first — it is stalling in the database permission layer.

What is actually happening:
1. Dashboard workout preview and Training workout preview both call `fetchWorkoutExerciseDetails()`.
2. That hits `workout_exercises`.
3. The browser log already shows the real failure: `57014 canceling statement due to statement timeout`.
4. Live database policy inspection shows the expensive legacy `workout_exercises` SELECT policy is still active.
5. Your last migration tried to drop it, but the live policy name includes a trailing space, so the drop did not actually remove it.
6. Because multiple SELECT policies are active, Postgres still evaluates the bad one, so every retest repeats the timeout.
7. Separately, the Training page client workout list still has a phase-only fetch path in `src/pages/Training.tsx`, so week-based program workouts can still disappear even after RLS is fixed.

Why it keeps “spinning then failing”
```text
UI click
  -> fetchWorkoutExerciseDetails()
    -> SELECT workout_exercises
      -> RLS evaluates old nested policy
        -> slow EXISTS / join chain
          -> statement timeout
            -> component catches error
              -> "No exercises found" or retry state
```

What I would fix

1. Normalize the live RLS policies from the actual database state
- Create one cleanup migration based on `pg_policies`, not guesses from old migration files.
- Drop the exact legacy `workout_exercises` policy name, including the trailing-space variant.
- Also review `workouts` SELECT policies: there are overlapping policies there too, including an old phase-only assignment policy.
- Recreate only the minimum safe policies:
  - direct owner/coach/admin access
  - assigned-program client access via `is_client_assigned_to_program(...)`

2. Keep the helper-function approach
- Continue using the existing `SECURITY DEFINER` helper `is_client_assigned_to_program`.
- Avoid any policy that walks the same chain inline when the helper can answer it.
- This prevents repeated deep policy evaluation and makes the rules understandable.

3. Fix the Training page query gap
- Update `src/pages/Training.tsx` so the client workout list supports both:
  - `program_workouts.phase_id`
  - `program_workouts.week_id`
- Right now the main training page can still miss workouts if the program is week-based, even if preview permissions are fixed.

4. Improve failure handling in preview components
Files:
- `src/components/dashboard/WorkoutStartPopup.tsx`
- `src/components/training/WorkoutPreviewModal.tsx`
- `src/pages/Training.tsx`

Changes:
- Treat timeout as an error state, not as “no exercises”.
- Show a real message like “Workout failed to load” instead of empty content.
- Preserve diagnostics in console logs so retest is meaningful.

5. Retest the exact broken flows end-to-end
I would verify all of these after the migration + code fix:
- Dashboard → click scheduled workout → modal loads exercise list
- Dashboard → Start Workout opens logger with exercises
- Training → Program tab → expand program → preview workout → exercise list shows
- Training → Program tab → Start workout works
- Training → Workouts tab/fallback list shows assigned workouts for clients
- Test a week-based program and a phase-based program
- Test client, coach, and admin visibility separately

Files involved
- `supabase/migrations/...` new cleanup migration
- `src/pages/Training.tsx`
- `src/components/dashboard/WorkoutStartPopup.tsx`
- `src/components/training/WorkoutPreviewModal.tsx`
- possibly `src/lib/workoutExerciseQueries.ts` only if better timeout/error surfacing is needed

Technical details

Critical finding from live state:
- `workout_exercises` still has these active SELECT policies:
  - legacy assigned-client policy
  - owner policy
  - program-client policy
- The legacy one was supposed to be removed, but it still exists in the database.
- The browser error confirms this is not theoretical; it is timing out at runtime.

Most likely root cause of the failed migration
```text
Expected drop:
DROP POLICY "Assigned clients can view workout exercises via linked program"

Actual live policy:
"Assigned clients can view workout exercises via linked program "
                                                             ^
                                                     trailing space
```

Why previous fixes did not fully resolve it
- The migration added indexes, which was correct.
- But the slow legacy policy still remained active, so the timeout persisted.
- The frontend then masked timeout as empty data.
- The Training page also still has a week/phase retrieval mismatch.

Expected outcome after proper fix
- No statement timeout on workout preview queries
- Dashboard and Training both show exercises immediately
- Training tab consistently shows assigned workouts, including week-based programs
- “Fix and retest” stops looping because the underlying live policy state is finally corrected
