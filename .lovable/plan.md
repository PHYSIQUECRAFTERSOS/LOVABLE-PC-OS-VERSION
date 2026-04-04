

## Root Cause Analysis

After exhaustive investigation of the database, RLS policies, and frontend code, I've identified the actual issue:

**The code and RLS policies are structurally correct.** The `is_client_assigned_to_program` helper works, all SELECT policies are in place, and the data exists. The problem is **not** in the RLS layer.

**The real problem is a race condition in `ClientProgramView.tsx` line 93-96.** When loading assignments, the component:
1. Fetches `client_program_assignments` (works — returns assignment rows)
2. Then fetches `programs` by ID using `.in("id", programIds)` 
3. If this second query returns empty (due to a transient RLS evaluation delay or Supabase SDK caching issue), the `programMap` is empty, `merged` filters everything out, and the client sees **"No programs assigned yet"**

Additionally, the `WorkoutPreviewModal` and `WorkoutStartPopup` both query `workout_exercises` with a joined `exercises` select. If the join returns null (e.g., `exercises:exercise_id(name)` returns null because the FK reference resolves to null), the mapped exercises show as empty — "No exercises found."

**Why it broke recently**: The changes to `useAuth.tsx` altered the timing of when `user` becomes available. Previously, by the time the Training page rendered, the Supabase client had a fully authenticated session with a fresh JWT. Now, with cached roles resolving faster, the component mounts and fires queries **before** the Supabase client has fully refreshed its access token. This causes the RLS evaluation to fail silently (returning empty arrays instead of errors).

## Plan

### Step 1: Add defensive logging to `ClientProgramView`
Add `console.log` statements at critical points to capture exactly what Supabase returns for each query (assignments, programs, phases, workouts). This will confirm the diagnosis on the user's device.

### Step 2: Fix the session-readiness race in `ClientProgramView`
Instead of relying on `user` being truthy, also check that `session` is available from `useAuth()`. The component should wait for a valid session before firing Supabase queries. This ensures the JWT is hydrated when RLS policies are evaluated.

**Files changed**: `src/components/training/ClientProgramView.tsx`
- Import `session` from `useAuth()`
- Guard the initial `useEffect` load with `!!session` in addition to `!!userId`
- Add the same guard to `toggleProgram`

### Step 3: Apply the same fix to `WorkoutPreviewModal` and `WorkoutStartPopup`
These components also fire Supabase queries that depend on RLS but don't wait for a valid session.

**Files changed**: 
- `src/components/training/WorkoutPreviewModal.tsx` — no auth dependency currently; add session check
- `src/components/dashboard/WorkoutStartPopup.tsx` — already has `useAuth()` but doesn't check `session`
- `src/components/dashboard/TodayWorkout.tsx` — same pattern

### Step 4: Fix `Training.tsx` client query path
The `useDataFetch` queryFn for clients queries `program_phases` and `program_workouts` but doesn't handle the case where RLS returns empty results gracefully. Add logging and ensure the fallback path (`workouts.client_id = user.id`) actually runs when the program path returns no data.

**Files changed**: `src/pages/Training.tsx`

### Step 5: Add console diagnostics for production debugging
Add targeted `console.log` statements (prefixed with `[Training]`, `[ClientProgramView]`, `[WorkoutPreview]`) so the next time this happens, we can see exactly which query returned empty and why.

### Summary of changes
- 4 files modified (no database changes needed — RLS is correct)
- Core fix: ensure Supabase queries only fire after session JWT is hydrated
- Defensive: add error logging at every query boundary
- No breaking changes, no new dependencies

