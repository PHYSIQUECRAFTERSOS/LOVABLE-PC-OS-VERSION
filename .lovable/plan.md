# Scope Training PDF Export to Current Phase Only

## Problem
`exportTrainingPdf` loops over every phase in the client's active program. For a client like Scott with an expired Phase 1 and a currently-active Phase 2, this both bloats the PDF and (based on your test) produced a PDF where no exercises came through for the phase you actually care about. Behavior should match Trainerize: export only the phase the client is on right now, with all its workouts and exercises.

## Fix (single file: `src/utils/pdf/exportTrainingPdf.ts`)

1. **Resolve the current phase** using the same rules the rest of the app uses (see `TrainingTab.tsx`, `CalendarTab.tsx`):
   - Fetch `program_phases` for the active program (already done).
   - Fetch `programs.start_date` (already fetched).
   - Run `derivePhaseDates(program.start_date, phases)` from `@/lib/phaseDates`.
   - Pick the phase in this priority:
     1. The phase where `derived[phase.id].isCurrent === true`.
     2. Else `assignment.current_phase_id` if it still exists in the list.
     3. Else the first phase whose `isCompleted === false` in `phase_order`.
     4. Else the last phase (program fully ended — still gives the coach something usable).
   - If nothing resolves, return `{ ok: false, reason: "No current training phase found." }`.

2. **Restrict all downstream queries to that one phase**:
   - `program_weeks` fetched with `.eq("phase_id", currentPhase.id)`.
   - `program_workouts` `or()` filter built from just that phase's id and its week ids (keeps the existing "attached via phase_id OR week_id" support).
   - `workout_exercises` query stays the same but now naturally receives only the current phase's workout ids, so no cross-phase noise.

3. **PDF output**:
   - Cover page unchanged (title, program name, client, coach).
   - Render exactly one phase section: `Phase N: <name>` where N is the phase's real `phase_order` position (1-based within the program), not always "Phase 1".
   - Include the same meta bits, description, day cards, exercise tables, and coach notes that already work.
   - Filename unchanged: `<client>-TrainingProgram-<date>.pdf`.

4. **Error surfacing**:
   - Keep existing early returns for "No active program", "Program not found", "Program has no phases yet".
   - Add the new "No current training phase found." case above.
   - No changes to callers — they already handle `{ ok, reason }`.

## Out of Scope
- No schema changes.
- No changes to the meal-plan PDF export.
- No changes to the training builder UI, phase duplication, or Add Phase.
- No new dependencies.

## Verification
- Scott (2 phases, Phase 1 completed, Phase 2 current): PDF contains only Phase 2 with every workout and every exercise row.
- Client with a single active phase: PDF looks the same as today for that phase.
- Client whose program has fully ended: PDF renders the last phase rather than erroring out silently.
