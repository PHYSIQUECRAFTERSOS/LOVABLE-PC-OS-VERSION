## Problem

Managers/coaches who aren't the program's owner can now see **phases** of shared master programs (fixed in a prior migration), but the phase workouts show **no exercises**. Checking the database RLS confirms why:

- `program_phases`, `program_weeks`, `program_workouts` — already have SELECT policies for shared master programs ✅
- `workouts` (SELECT `workouts_select_all_paths`) — only allows `coach_id = auth.uid()`, assigned client, or admin. **No shared-master path.** ❌
- `workout_exercises` (SELECT `workout_exercises_select_all_paths`) — same gap. ❌

So the join `program_workouts → workouts → workout_exercises → exercises` breaks at `workouts`, and the exercises inside each phase workout are filtered out for non-owner coaches.

Cloning/copying and subscribing clients also depend on being able to SELECT those child rows, so fixing SELECT unblocks all three flows (view, clone, subscribe).

## Fix (single migration)

Add two additive SELECT policies. No existing policies dropped, no schema changes.

1. **`workouts` — "Coaches view shared master program workouts via program"**
   Allow SELECT when the workout is referenced by a `program_workouts` row whose parent program is `is_master = true AND is_template = true`, and the caller has `coach` or `admin` role.

2. **`workout_exercises` — "Coaches view exercises of shared master program workouts"**
   Same rule, one level deeper (join through `workouts → program_workouts → programs`).

`exercises` SELECT is already `USING (true)`, so no change needed there.

## Why this covers the other asks

- **See all phases + exercises**: fixed by the two new SELECT policies.
- **Clone / "Make a copy"**: the clone code (`ProgramList.tsx`, `ProgramDetailView.tsx`) reads phases → program_workouts → workouts → workout_exercises, then inserts new rows owned by the acting coach. The insert policies on `programs` (`is_null`), `program_phases`/`program_weeks`/`program_workouts` (ALL — coach owns the new program), `workouts` (INSERT allowed for coaches), and `workout_exercises` (ALL via own workout) are already permissive. Only SELECT on source rows was blocking.
- **Subscribe own client to shared program**: `client_program_assignments` INSERT policy has no restriction, and the SELECT policy already lets any coach see the assignment for their own client. Works as soon as the coach can read the source program's structure.

## Roles note

The role system in this project is `admin | coach | client` (`has_role()`). "Manager" and "Owner" in the UI map to `coach` and `admin` respectively — no new role enum needed. The two new policies use `has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin')`, mirroring the existing shared-master policies.

## Files touched

- New migration: `supabase/migrations/<timestamp>_coaches_view_shared_master_workouts.sql` — the two `CREATE POLICY` statements above.
- No frontend changes required; existing queries in `ProgramDetailView.tsx`, `useClientProgram.ts`, and clone helpers will start returning the previously-hidden rows immediately.

## Verification after apply

1. Log in as the manager coach → open a shared master program → confirm exercises render inside each phase workout.
2. From that view, click "Make a Copy" → confirm the cloned program appears in their Personal list with all phases/exercises intact.
3. Assign a client of theirs to the shared master program → confirm the assignment saves and the client sees the workouts on their Training tab.
