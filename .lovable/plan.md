## Problem

When you "Assign to Client" a master program with 9 workouts (e.g., Zach Ivie program → Phase 2), only 3–6 workouts actually end up on the client's profile. You then have to copy the missing days one by one.

I confirmed this in the database: the most recent assign for Zach created the new phase but only attached 5 of 9 workouts (sort_orders 0, 1, 6, 7, 8 — gaps at 2, 3, 4, 5). The prior attempt got 6 of 9. The "Zach Ivie program" master phase itself correctly has all 9 workouts, so the source data is fine — the bug is in the assign/clone routine.

## Root cause

`assignToClient` in `src/pages/MasterLibraries.tsx` clones each workout by calling `cloneWorkoutWithExercises`, which:

1. Reads the source workout.
2. Inserts a new workout row.
3. Reads source exercises.
4. **Inserts exercises one-by-one in a sequential `for` loop** (one HTTP round-trip per exercise).

For Zach's 9 workouts × ~10 exercises each, that's roughly 90+ sequential round-trips taking ~90 seconds. During that window:

- Any transient network blip / RLS hiccup on a single exercise insert is logged but **swallowed** (`if (!clientW) continue;` in `MasterLibraries.tsx` line 428).
- The browser tab can be backgrounded or the dialog re-clicked, aborting the rest.
- The toast still says "Client subscribed", so you don't see that workouts were skipped.

That's why the failure is partial and non-deterministic (different count each retry).

## Fix

Three tightly-scoped changes — all on the coach-side assign flow, no schema changes:

### 1. Bulk-insert exercises in `cloneWorkoutWithExercises`
File: `src/lib/cloneWorkoutHelpers.ts`

Replace the per-exercise `for` loop (~lines 119–129) with a single `.insert([...]).select()` call passing all exercises at once. This cuts ~10 round-trips per workout down to 1 and removes the slow window where things get interrupted. Keep the existing per-row error reporting by checking returned row count vs expected.

### 2. Stop silently swallowing failed clones in `assignToClient`
File: `src/pages/MasterLibraries.tsx` (around lines 423–439)

When `cloneWorkoutWithExercises` returns `workout: null` or the `program_workouts` insert errors, currently the loop just `continue`s. Change it to:

- Collect the failed workout names into a `failedWorkouts: string[]`.
- After the loop, if `failedWorkouts.length > 0`, show a destructive toast like `"4 of 9 workouts failed to copy: …"` instead of the cheerful "Client subscribed" message.
- Surface the same info in the existing import summary (`buildImportSummary`).

### 3. Retry the per-workout attach on failure
File: `src/pages/MasterLibraries.tsx`

Wrap the `program_workouts` insert in a one-time retry (small `await new Promise(r => setTimeout(r, 250))` then re-try) to absorb transient RLS / network blips. If the retry still fails, log it into `failedWorkouts` from step 2.

### 4. Apply the same fixes to the sibling code paths

The same loop pattern exists in:
- `src/components/clients/workspace/TrainingTab.tsx` (`handleAssignProgram` — used when assigning from the client's profile)
- `src/lib/copyPhaseHelpers.ts` (`copyPhaseToClientProgram`, `copyPhaseToMasterProgram`, `createSinglePhaseProgramForClient`)

All of them ultimately call `cloneWorkoutWithExercises`, so fix #1 helps every assign flow automatically. I'll also apply fix #2 (visible error reporting) in `TrainingTab.tsx` and the `copyPhaseHelpers` callers so partial failures never go silent again.

## Verification

After the change:

1. Re-assign "Zach Ivie program" → Phase 2 to a test client.
2. Confirm all 9 workouts (`Day 1–4`, `[AWAY] Day 1–4`, `Stretches`) land in the client's program in the correct sort order.
3. If anything fails, you'll get a destructive toast naming the workouts that didn't copy, so you can retry instead of discovering it visually.

## Out of scope

- No changes to RLS, schema, or the underlying program/phase/workout structure.
- No changes to client-side training UI or how workouts render.
- Master-library content is not touched.
