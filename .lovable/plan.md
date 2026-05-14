## Goal
Add **AI Import** to the kebab menus in the Master Library so phases (and workouts) can be transferred from PDFs much faster — no need to re-create a new program every time.

## Two new menu entries

### 1. Program kebab → "AI Import (as new phase)"
Click the 3-dots on a master program → **AI Import** → upload PDF/images → review → on save, a **new phase** is appended to that program with all extracted workouts. Phase is auto-numbered (e.g. if the program has 4 phases, this becomes "Phase 5"). The program itself is **not** duplicated.

### 2. Phase kebab → "AI Import (workouts into this phase)"
Click the 3-dots on a specific phase → **AI Import** → upload → review → workouts are appended to **that existing phase** (sort_order continues from the last workout). No new phase is created.

Both reuse the existing `AIImportModal` review flow (extraction, exercise matching, auto-create unmatched exercises, rest-redistribution rules — all unchanged).

## Files to change

**`src/components/import/AIImportModal.tsx`** — add an optional target mode and rewire `saveWorkoutProgram` to branch on it:
- New props: `targetProgramId?: string`, `targetPhaseId?: string`, `targetMode?: "new-program" | "append-phase" | "append-to-phase"` (default `"new-program"` — preserves all existing call sites).
- In the save path:
  - `"new-program"` (today's behavior): unchanged.
  - `"append-phase"`: skip program insert. Look up `program_phases` for `targetProgramId`, take `MAX(phase_order)+1` as the new phase_order, name it `"Phase N"`. Insert workouts under that new phase as today.
  - `"append-to-phase"`: skip both program and phase inserts. For each extracted day, create a `workouts` row and a `program_workouts` row linked to `targetPhaseId` with `sort_order = MAX(existing sort_order)+i+1`.
- Force `docType` to `"workout"` when either target prop is present (PDF must be a workout doc) and hide the doc-type selector in upload step in that case.
- All other branches (meal/supplement) untouched.

**`src/pages/MasterLibraries.tsx`**
- Add two state slots: `aiImportTarget: { programId?: string; phaseId?: string } | null`.
- Program kebab: new `<DropdownMenuItem>` "AI Import" with Sparkles icon → sets `{ programId: program.id }`.
- Phase kebab: new `<DropdownMenuItem>` "AI Import" → sets `{ programId: program.id, phaseId: ph.id }`.
- Render `<AIImportModal>` once at page level when `aiImportTarget` is set, passing the appropriate `targetMode`, `targetProgramId`, `targetPhaseId`. On `onImportComplete`, refresh the program/phase lists (existing refresh hook) and close.
- Gate both menu items by `canEditProgram(program)` (consistent with other mutating actions).

## Notes / out of scope
- No DB schema changes. Uses existing `programs`, `program_phases`, `program_workouts`, `workouts`, `workout_exercises`, `exercises` tables.
- The exercise-match review screen still appears so unmatched exercises can be confirmed before save (same UX as today).
- Other AI Import call sites (client workspace, supplement library, meal library) are untouched — they continue working in `"new-program"` mode by default.
- iOS/PWA upload behavior unchanged.

## Verification
1. Master Library → kebab on a master program → click "AI Import" → upload `BW_circuits-2.pdf` → confirm exercises → save. Refresh: the program now has one extra phase named e.g. "Phase 5" with the imported days. Original phases untouched.
2. Expand a program, kebab on a specific phase → "AI Import" → upload → save. That phase now contains the original workouts plus the newly imported ones, with sort_order continuing.
3. Existing client-workspace AI Import still creates a brand-new program (no regression).
