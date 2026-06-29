
# Goal
Stop Copy-to-Client from wiping the client's current training phase, and let you bring old phases back from the archive — Trainerize-style.

## Part 1 — Copy Phase to Client should APPEND (not replace)

**Where:** `src/components/training/ProgramDetailView.tsx` (the "Copy Phase to Client" dialog launched from Master Libraries).

**Current behavior (the bug that erased Jordan's program):**
When you pick *"Immediately after last scheduled training phase"*, the code creates a **brand-new program** for the client, then calls `applyMerge()`, which truncates the current active program (e.g. "Jordan C program") and pushes it down to *Previous Programs*. The new phase becomes its own one-phase program.

**Fix:**
- When option = *"Immediately after last scheduled training phase"*, call the existing `copyPhaseToClientProgram()` helper from `src/lib/copyPhaseHelpers.ts`. That helper already does exactly what you described:
  - Finds the client's active program
  - Appends the new phase at the end (next `phase_order`)
  - Deep-clones workouts/exercises/sets
  - Recomputes program `duration_weeks`
  - Leaves the current phase, assignment, and calendar events untouched
- Only when option = *"Start on a specific date"* do we keep the current new-program-and-truncate flow (because a hard date requires cutting the running program).
- Update the dialog copy: rename the first option to **"Append after current phases"** and add a one-line hint so it's obvious it won't disturb the running program.
- If the client has no active program at all and *"Append"* is chosen, fall back to today's start date and create a new program (so the action still works for new clients).

**Toast:** show "Phase appended to {programName}" with the standard exercise-count summary. No "previous program truncated" warning in append mode.

## Part 2 — Restore from Previous Programs (archive)

**Where:** `src/components/clients/workspace/TrainingTab.tsx`, the existing **Previous Programs** collapsible (left side of the Training tab — visible in your second screenshot showing "Jordan C program" and "phase 7: triple cluster").

**Today:** previous programs are read-only — you can't bring them back.

**Add:**
- For each row, a kebab menu (`⋯`) with two actions:
  1. **Restore phases to current program** — clones every phase from the archived program and appends them (in their original order) to the client's active program, using the same append helper from Part 1. The archived program stays in *Previous Programs* (so restoring is non-destructive and repeatable).
  2. **View phases** — opens a read-only modal listing the archived program's phases + workout names, so you can pick what to reuse before restoring. (Uses the same data shape the Training tab already loads.)
- Add a small **Restore** button (gold, icon = `Undo2`) next to the kebab for one-tap access to action #1.
- After restore, refresh `useClientProgram` so the new appended phases appear on the right pane immediately, and toast "Restored N phase(s) from {oldProgramName}".

**No DB schema changes.** Restoration reuses the existing `program_phases` / `program_workouts` / cloning pipeline — the archived assignment row stays `status='completed'` and isn't mutated.

## Technical Details

Files touched:
- `src/components/training/ProgramDetailView.tsx` — branch on `copyStartOption`; call `copyPhaseToClientProgram` for the append path; update dialog labels.
- `src/lib/copyPhaseHelpers.ts` — add `restorePreviousProgramPhases({ coachId, sourceProgramId, targetClientId })` that loads all phases of the source program (ordered by `phase_order`) and calls the existing append logic per phase. Returns a combined `CloneWorkoutResult` summary.
- `src/components/clients/workspace/TrainingTab.tsx` — extend the Previous Programs list rows with a `DropdownMenu` (Restore / View) and a primary Restore icon button; wire it to the new helper and `reload()` the program after success.
- (Optional) tiny `PreviousProgramViewerDialog.tsx` for the "View phases" action — read-only list of phases + workout names.

Edge cases handled:
- Client has no active program when restoring → toast "Assign an active program first" (mirrors existing behavior in `copyPhaseToClientProgram`).
- Source program has zero phases → toast "Nothing to restore".
- Restore is idempotent: clicking twice creates duplicate appended phases (acceptable and matches Trainerize); the user can delete extras with the existing phase delete action.

## Out of Scope
- No changes to nutrition meal-plan archive logic.
- No changes to the "Specific date" branch of Copy-to-Client (still truncates, by design).
- No DB migrations.
