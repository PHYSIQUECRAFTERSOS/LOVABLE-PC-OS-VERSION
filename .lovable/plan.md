# Trainerize-style phase date editor

Goal: replace the current weeks-only "Change Duration" dialog with one that lets the coach edit **Start date, End date, and Weeks** for any training phase, with a real calendar popover (like Trainerize). All three fields stay in sync; later phases cascade automatically.

## UX

Dialog title: **Edit Training Phase** (replaces "Change Duration").

Layout (matches the second screenshot you shared):

```text
Edit Training Phase
┌─────────────────────────────────────┐
│ [ Start on  9 Jun 2026 📅 ]         │
│ [ until    3 Aug 2026 📅 ]          │
│ Duration: [ 8 ] weeks               │
│                                     │
│ This phase will end on 3 Aug 2026   │
│ (Monday).                           │
└─────────────────────────────────────┘
            [ Cancel ]  [ Save ]
```

- Start / End use shadcn `Popover` + `Calendar` (single-date), styled in our matte black + gold theme.
- All three fields are editable; editing any one recomputes the others live:
  - Change **Start** → keep weeks, recompute End.
  - Change **End** → recompute Weeks (and clamp 1–52).
  - Change **Weeks** → keep Start, recompute End.
- Helper line shows the resolved end date + weekday, like Trainerize.
- Validation: End ≥ Start; Weeks 1–52. Inline error if violated.

## Cascade rules (per your answers)

- **Edit this phase only**, later phases slide to stay sequential (no gaps, no overlaps).
- If the edited phase is **Phase 1** and its Start moves, the program's `start_date` shifts with it so later phases cascade from the new origin.
- Earlier phases are never touched.
- **Calendar events are left untouched** (safest). The dialog shows a small note: "Scheduled workouts on the calendar are not moved automatically." Coach can drag-reschedule as needed.

## Technical details

### Schema (one additive migration)
- Add nullable `start_date date` to `program_phases`. (`end_date` stays derived from `start_date + duration_weeks * 7 - 1`; `derivePhaseDates` already honors an explicit `start_date` when present, so existing flows keep working.)
- No data backfill — null means "derive sequentially from program.start_date", which is today's behavior.

### Save logic (`TrainingTab.tsx` → new `savePhaseDates`)
Given edited phase P with new `{ startDate, weeks }`:
1. Compute `endDate = startDate + weeks*7 - 1`.
2. If P is `phase_order === 1` and `startDate !== program.start_date` → update `programs.start_date` to `startDate` and clear any explicit `start_date` on later phases (so they cascade).
3. Update P: `{ start_date: startDate, duration_weeks: weeks }`.
4. For every phase with `phase_order > P.phase_order` whose explicit `start_date` is now inconsistent with the new cascade, clear it (`start_date = null`) so `derivePhaseDates` reflows them from P's new end.
5. `loadClientProgram()` to refresh; toast "Phase updated".

All writes use `.select()` to verify per project rules. Wrapped in `Promise.allSettled` where independent.

### Component changes
- Rewrite `src/components/clients/workspace/training/ChangeDurationDialog.tsx`:
  - Rename export stays `ChangeDurationDialog` (call sites unchanged) but title/UX becomes "Edit Training Phase".
  - New props: `initialStartDate: string | null`, `programStartDate: string | null`, `onSave({ startDate, weeks })`.
  - Uses shadcn `Calendar` inside `Popover` with `pointer-events-auto`.
- `TrainingTab.tsx`:
  - Pass `initialStartDate` (from `derivePhaseDates` result) and `programStartDate`.
  - Replace `changePhaseDuration(weeks)` call with new `savePhaseDates({ startDate, weeks })`.

### Files touched
- `src/components/clients/workspace/training/ChangeDurationDialog.tsx` (rewrite)
- `src/components/clients/workspace/TrainingTab.tsx` (props + save handler)
- 1 migration: `ALTER TABLE program_phases ADD COLUMN start_date date`

### Verification
- Edit Phase 2 start → Phase 2 shifts, Phase 3 follows; Phase 1 unchanged.
- Edit Phase 1 start → program start moves; all phases shift.
- Edit End date → Weeks updates correctly.
- Set Weeks → End date updates correctly.
- Calendar view (`usePhaseBoundaries`) reflects new boundaries since it already reads `derivePhaseDates`.
- Mobile 375px: calendar popover stays inside viewport.
