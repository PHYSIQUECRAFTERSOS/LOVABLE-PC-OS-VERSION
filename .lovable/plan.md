
## Goal
When a coach subscribes a master program or copies a phase to a client who already has an active program, the previous program should be **truncated**, not erased. The new program starts on a coach-chosen date, the old program ends the day before, and conflicting future calendar events are removed. Mirrors Trainerize.

## Changes

### 1. Unified "Assign Program to Client" dialog
Apply to both entry points:
- `src/components/training/ProgramList.tsx` (Master Libraries → Subscribe)
- `src/components/clients/workspace/TrainingTab.tsx` `AssignDialog` (workspace Change/Assign)
- `src/components/training/ProgramDetailView.tsx` Copy-Phase-to-Client (single phase copy)

Add to all three:
- **Start date picker** (shadcn `Calendar` in `Popover`, `pointer-events-auto`).
  - Default: **day after the client's current active program's computed end date**. If client has no active program, default to today.
  - Live helper text: `Current program: <name> · ends <date> · this will be cut short on <newStart - 1 day> if you choose an earlier date.`
- Subscribe vs Import toggle (already exists in two of three; add to TrainingTab's dialog).
- Auto-Advance Phases toggle (already exists in ProgramList; mirror in others).

### 2. New helper: `assignProgramWithMerge`
New file `src/lib/programAssignment.ts` exporting one function used by all three call sites:

```text
assignProgramWithMerge({
  clientId, coachId, masterProgramId | phaseSource, startDate,
  mode: "subscribe" | "import",
  autoAdvance, isPhaseOnly
})
```

Steps inside (sequential, awaited):

1. **Find current active assignment** for `clientId` (`status in active|subscribed`, newest).
2. **Compute its true end date** using `derivePhaseDates` over its phases (last phase end). If `startDate > endDate`, no truncation needed — old program is left alone and will naturally complete.
3. **If `startDate ≤ endDate`** (overlap), truncate:
   - Identify the phase containing `startDate`. Set its `duration_weeks` so it ends on `startDate − 1`. If `startDate` lands inside week 1 of phase 1, mark the old assignment `status='completed'` outright with no phases retained beyond what's already completed.
   - For all later phases of the old program, leave the rows but ensure they don't extend past the new start by clearing explicit `start_date` (cascading is handled by `derivePhaseDates`). Truncating the containing phase is enough since later phases derive from it.
   - Update old `client_program_assignments`: set `status='completed'` and (new column) `ended_on = startDate - 1`.
4. **Delete ALL future calendar events from the OLD program** (completed or not) on/after `startDate`:
   - Pull `program_workouts.workout_id` for every workout in the old program (across all phases/weeks).
   - `DELETE FROM calendar_events WHERE target_client_id = clientId AND event_date >= startDate AND linked_workout_id IN (...oldWorkoutIds)`.
   - Also delete `event_type IN ('workout','cardio')` rows with `target_client_id = clientId` and `event_date >= startDate` AND `linked_workout_id IS NULL` only if explicitly tied to the old program via cardio_assignments — keep it scoped to workouts to avoid wiping unrelated events. (Cardio cleanup deferred unless we discover a link.)
5. **Clone the new program/phase** to the client (existing logic moved here unchanged from `cloneProgramToClient` / `handleCopyPhaseToClient` / `handleAssignProgram`).
6. **Insert new `client_program_assignments`** with `start_date = startDate`, `current_phase_id = firstPhaseId`, `status='active'`, `is_linked_to_master`, `auto_advance`, etc.
7. Return `{ newProgramId, truncatedOldAssignmentId, deletedEventsCount, cloneSummary }` for the toast.

### 3. Schema migration
Add to `client_program_assignments` (additive only):
- `ended_on date NULL` — actual end date when truncated early.

Triggered by migration tool. No RLS changes needed (existing policies still apply).

### 4. Previous Programs section
In `src/components/clients/workspace/TrainingTab.tsx`:
- Below the active program card, render a collapsible **"Previous Programs"** accordion when the client has any `client_program_assignments` with `status='completed'` (excluding the active one).
- Each row: program name, `start_date – ended_on (or computed end)`, badge `Truncated` if `ended_on` is non-null AND earlier than the original derived end, link to view (read-only modal reusing existing `PhaseListSidebar` + workout list, no edit buttons).
- Implementation: lightweight read-only viewer modal `PreviousProgramViewer.tsx` opened from the list. Reuses `usePhaseBoundaries` + `derivePhaseDates`.

### 5. Toast and confirmation
Before running the merge, if `startDate ≤ currentEnd`, show an `AlertDialog`:
> "<Client> is on <old program> until <old end>. This will cut that program short on <startDate − 1>, delete <N> future calendar events, and start the new program on <startDate>. Continue?"

`N` is pre-counted with a SELECT count(*) before the mutation runs. Coach confirms → run.

### 6. Verification (after build)
- Subscribe a master program from Master Libraries to a client with an active program, start date inside the active program → confirm old shows in "Previous Programs" with truncated end, new is active starting on that date, calendar future events from old program are gone.
- Subscribe to a client with no active program → behaves like today (no truncation step).
- Copy a single phase from `ProgramDetailView` → same merge behavior.
- Mark old program's PAST calendar events (before start date) untouched, completed workouts preserved (history intact).

## Files touched
- `src/lib/programAssignment.ts` (new)
- `src/components/training/ProgramList.tsx` (route subscribe through new helper)
- `src/components/clients/workspace/TrainingTab.tsx` (add date+toggles to `AssignDialog`, route through helper, render Previous Programs accordion)
- `src/components/training/ProgramDetailView.tsx` (route Copy-Phase-to-Client through helper)
- `src/components/clients/workspace/training/PreviousProgramViewer.tsx` (new)
- Migration: add `ended_on date` to `client_program_assignments`.

## Non-goals (this pass)
- No changes to cardio_assignments cleanup; only `workout` events linked to the old program are removed.
- No re-generation of new calendar events for the new program (calendar event creation remains coach-driven, matching current behavior).
- No changes to the active program's phase-date editor (recently shipped).
