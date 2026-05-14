## Problem

1. **Schedule Event → "Link Workout" shows wrong phase.** It loads workouts from `client_program_assignments.current_phase_id`, which is a static pointer that doesn't follow phase date boundaries. When Phase 1's duration is shortened, the assignment still points at Phase 1, so Phase 2's workouts never show.
2. **Change Duration only accepts weeks.** Coaches think in end-dates too (e.g. "make this phase end May 11").
3. **Calendar gives no visual cue** that one phase ended and a new one started on a given date.

## Fix

### 1. Date-aware current phase in `ScheduleEventForm.tsx`
Replace the `current_phase_id`-based lookup with date-driven resolution:
- Load **all** phases for the assigned program (`program_phases` ordered by `phase_order`) plus `programs.start_date`.
- Run them through existing `derivePhaseDates()` from `src/lib/phaseDates.ts`.
- Pick the phase whose `[start_date, end_date]` window contains the form's `eventDate` (the date the coach is scheduling for).
  - Falls back to: current phase by today, then last phase if eventDate is past program end, then first phase if before program start.
- Re-fetch `program_workouts` whenever `targetClientId` **or** `eventDate` changes.
- Show a small caption above the workout dropdown: "Showing workouts from **PHASE 2: Prep Mens physique**" so the coach knows which phase is active for that date. Trainerize does the same.

### 2. End-date option in `ChangeDurationDialog.tsx`
- Add a segmented toggle at the top: **Weeks | End Date**.
- Weeks tab: existing numeric input (1–52).
- End Date tab: native date picker. Compute weeks from `(endDate − phaseStart) / 7`, rounded up, clamped 1–52. Display a live preview: "≈ 6 weeks (05 May – 16 Jun 2026)".
- `onSave(weeks)` signature stays the same — the dialog just converts a chosen end date back into weeks before calling it. No DB schema change, no business-logic change.
- Phase start date comes in as a new optional prop `phaseStartDate` (already known by the caller in `TrainingTab.tsx`).

### 3. Phase-boundary markers on the calendar
In `CalendarGrid.tsx` (month view) and `CalendarDayList.tsx` (week view):
- Compute phase boundaries from the active program via `derivePhaseDates()`.
- On the **last day of a phase**: thin gold bottom border + small badge "Phase N ends".
- On the **first day of the next phase**: thin gold top border + badge "Phase N+1 starts — {phase name}".
- Pure presentation, no event-data changes. Uses existing `--primary` gold token.

## Technical notes

- `derivePhaseDates()` already returns `start_date`, `end_date`, `isCurrent`, etc. — no new helper needed.
- The `current_phase_id` column is left untouched (other places still rely on it for "current week" math). Only the *workout picker* and the *calendar markers* switch to date-driven resolution.
- All date math must use the existing `parseLocal` / `toLocalYMD` pattern (no `toISOString()`).
- Fetches stay parallel-safe; the workout dropdown is debounced via the existing useEffect deps.

## Files touched

- `src/components/calendar/ScheduleEventForm.tsx` — date-driven phase resolution + caption
- `src/components/clients/workspace/training/ChangeDurationDialog.tsx` — Weeks/End-Date toggle
- `src/components/calendar/CalendarGrid.tsx` — phase boundary markers (month)
- `src/components/calendar/CalendarDayList.tsx` — phase boundary markers (week/day list)
- New tiny hook `src/hooks/usePhaseBoundaries.ts` — fetches program + phases for a given client and returns a `Map<date, { type: 'end'|'start', phaseName, phaseNumber }>` used by both calendar views.

## Out of scope

- Auto-updating `client_program_assignments.current_phase_id` based on dates (separate concern, would touch dashboard / week-number logic).
- Drag-resizing phase blocks on the calendar.
