## What the user is asking for

1. **Master Libraries → visible "Add Phase" button** next to `AI Import` / `+ New`, and inside each program's overview (right pane). Today, Add Phase only exists deep inside `ProgramDetailView` (workout view), and the ProgramOverviewPane literally tells them "Add a phase from the workout view." That's why they don't see it.
2. **Instant feedback when adding a phase.** Today `handleAddPhase` in `TrainingTab.tsx` awaits `insert` → toast → `await loadClientProgram()` (full re-fetch). On slow networks / large programs this feels like nothing happens for a long time and can also fail with `TypeError: Failed to fetch`. We need optimistic UI: a placeholder phase appears in <100ms with a spinner badge, DB write happens in the background, error rolls it back.
3. **Trainerize-style "Save Training Phase As" dialog for Duplicate.** Today Duplicate blindly runs `duplicatePhaseInPlace` (deep-clones every workout sequentially — many round-trips, prone to timeout, and the error toast the user saw). We need:
    - A dialog with **Name**, **Start date**, and **End** (either explicit end date OR "N weeks" — matching the assignment dialog pattern already used in `copyPhaseToClientProgram`).
    - Instant close + background clone with a "Duplicating…" toast that resolves into a "Duplicated" toast — never a blocking spinner.
    - All workout notes (`workouts.description`, `workouts.instructions`, per-exercise `notes`) are already copied by `cloneWorkoutHelpers` — verified. Just needs to run reliably.
    - Faster: parallelize the per-workout clones with `Promise.all` (currently sequential `for … await`), which is the root cause of the multi-minute wait on 5–8 day phases.

## Files to change

**`src/components/training/ProgramOverviewPane.tsx`**
- Add `onAddPhase?: () => void` prop.
- Render a `+ Add Phase` button in the header row (next to the phase-count line) and as a large dashed empty-state CTA when `phases.length === 0`.
- Also render a `+ Add Phase` tile at the end of the grid so it's always visible without scrolling to the workout view.

**`src/pages/MasterLibraries.tsx`**
- New `handleAddMasterPhase(programId)` that:
    - Optimistically bumps `overviewRefreshKey` after inserting a `program_phases` row with `phase_order = max+1`, `duration_weeks = 4`, `name = "Phase N"`.
    - Toast `"Phase added"` immediately; on failure show error toast and refetch.
- Wire `onAddPhase` on `<ProgramOverviewPane …>` at line 859.
- Add a `+ Add Phase` `DropdownMenuItem` inside the program-row three-dot menu (line 560 area), between Duplicate and AI Import, so it's reachable from the sidebar too.

**`src/components/clients/workspace/TrainingTab.tsx` — `handleAddPhase`**
- Switch to optimistic pattern: push a temp phase (with `id: "temp-<uuid>"`) into local `phases` state immediately, insert to DB in the background via `EdgeRuntime`-free plain async, then replace the temp id with the real one on success. On failure, remove the temp row and toast the error. No more `await loadClientProgram()` blocking the click.

**`src/lib/copyPhaseHelpers.ts` — `duplicatePhaseInPlace`**
- Accept optional overrides `{ nameOverride?: string; durationWeeksOverride?: number; startDate?: string }`.
- Insert the phase row first, then **clone workouts in parallel** with `Promise.all(sourcePws.map(pw => cloneWorkoutWithExercises(...)))` instead of the current sequential `for` loop, then bulk-insert the `program_workouts` join rows in one call. This is where the 2-minute wait / "Failed to fetch" comes from.
- If `durationWeeksOverride` is provided, use it in the phase insert and in the program `duration_weeks` recompute.

**New `src/components/training/DuplicatePhaseDialog.tsx`** (small, mirrors the assign-to-client dialog visually)
- Fields: `name` (default `"<source> (Copy)"`), `start_date` (date picker, default today), and a toggle "End on date" vs "N weeks" (default = source phase's `duration_weeks`).
- On confirm: close dialog instantly, fire background `duplicatePhaseInPlace({ …, nameOverride, durationWeeksOverride, startDate })`, show a `sonner` promise toast (`"Duplicating phase…"` → `"Phase duplicated"` / `"Duplicate failed"`).

**Wire the new dialog in**
- `src/components/clients/workspace/TrainingTab.tsx`: replace the direct `duplicatePhase(phase)` call with opening `DuplicatePhaseDialog`.
- `src/components/training/ProgramDetailView.tsx`: same — replace the current in-menu `duplicatePhase(idx)` (pure local state, no DB round-trip today, so also swap it to a real DB duplicate via the same helper so Master Libraries duplicates persist properly).

## What is explicitly not changing
- Backend schema (`program_phases`, `program_workouts`, `workouts`) — no migrations.
- RLS policies.
- The `copyPhaseToClientProgram` / `copyPhaseToMasterProgram` flows already work; they just inherit the same "parallel clone" speedup for free.
- Nutrition, messaging, ranked systems — untouched.

## Risk notes
- Parallel workout cloning: `cloneWorkoutWithExercises` writes to `workouts`, `workout_exercises`, and `workout_sets`. Each call is independent (new row per clone), so parallelism is safe. Worst case we hit Supabase rate limits on very large phases — we'll cap concurrency at 6 with a small pool helper if needed.
- Optimistic add: if the DB insert fails, we roll back the temp row and toast the error; no orphan data.
