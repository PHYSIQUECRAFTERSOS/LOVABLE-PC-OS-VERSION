## Issues

**1. Add Phase does nothing on client Training tab**
`handleAddPhase` in `src/components/clients/workspace/TrainingTab.tsx` (line 614) inserts a `program_phases` row, but the button is wrapped in `guardEdit(...)` which opens the "Detach from master" modal whenever `assignment.is_linked_to_master` is true. On detached programs the insert runs but nothing appears because `phase_order` collides with an existing phase, or the reload races the insert. Net effect: silent no-op.

**2. Duplicate Phase copies phase row only — no workouts, no exercises**
`duplicatePhase` in the same file (line 684) only inserts a `program_phases` row. It never copies `program_workouts`, and never deep-clones the underlying `workouts` + `workout_exercises`. Result matches your screenshot: "Phase 1 (Copy)" shows `0 workouts`.

The deep-copy plumbing already exists — `copyPhaseToClientProgram` in `src/lib/copyPhaseHelpers.ts` clones phase + workouts + exercises via `cloneWorkoutWithExercises`. In-place duplicate just isn't using it.

## Plan

### A. Fix `handleAddPhase` (client Training tab)

`src/components/clients/workspace/TrainingTab.tsx`:

- Compute `phase_order` as `Math.max(...phases.map(p => p.phase_order), 0) + 1` instead of `phases.length + 1` (avoids collisions after deletes/reorders).
- Insert with `.select().single()` so we can surface real errors and confirm the row.
- Await `loadClientProgram()` and toast only on success. Log the insert error to console with `[TrainingTab.handleAddPhase]` prefix.
- Keep `guardEdit` behavior unchanged (Trainerize-style: linked-to-master programs must be detached first).

### B. Deep-duplicate a phase in place

Add a helper `duplicatePhaseInPlace` in `src/lib/copyPhaseHelpers.ts` that:

1. Loads the source phase's `program_workouts` rows (with `day_of_week`, `day_label`, `sort_order`, `exclude_from_numbering`, `custom_tag`).
2. Inserts a new `program_phases` row in the same `program_id`, name `"<source> (Copy)"`, next `phase_order`, copying `duration_weeks`, `training_style`, `intensity_system`, `custom_intensity`, `progression_rule`, `description`.
3. For each source `program_workouts` row, calls `cloneWorkoutWithExercises(sourceWorkoutId, coachId, clientId, false)` to create a brand-new `workouts` row with all `workout_exercises` (sets, reps, rest, RIR, RPE, tempo, notes, groupings) — exactly what the existing Import → Master flow does.
4. Inserts the new `program_workouts` row against the new phase preserving `day_of_week`, `day_label`, `sort_order`, `exclude_from_numbering`, `custom_tag`.
5. Runs workout clones sequentially (matches project convention — avoids race conditions on `sort_order`), collects `CloneWorkoutResult[]`, returns an `ImportSummary` toast payload.

Wire `TrainingTab.duplicatePhase` to call the new helper and show the summary toast (success / warning-with-mismatches, same UX as Import).

### C. Master Libraries "Add Phase"

The master-library ProgramDetailView already has an `Add Phase` button (line 1414) and a working `duplicatePhase` (line 371, deep-copies workouts client-side then persists on Save). No fix needed there — confirming that's what you meant, or did you want a new entry point elsewhere (e.g., inline in the phase list dropdown, matching the client tab)?

## Out of scope

- Changing `guardEdit` behavior for linked-to-master programs.
- Any schema/RLS migrations (existing policies already allow these inserts).
- Program-level duplicate (this covers phase-level only).

## Clarifying question

For **#1 master libraries**: Master Libraries already has a working "Add Phase" button on the program detail view (bottom of the phase list). Is your ask that you want (a) nothing new there — it already works, or (b) an additional "Add Phase" entry in the phase context menu (next to "AI Create New Phase" / "Rename" / "Duplicate")? I'll assume (a) unless you say otherwise. I want  (b) an additional "Add Phase" entry in the phase context menu (next to "AI Create New Phase"

&nbsp;