# Fix: Phase dates never render in client profile Training tab

## Root cause
`src/hooks/useClientProgram.ts` line 96 selects programs with this column list:

```
"id, name, description, goal_type, version_number, is_master"
```

`start_date` and `end_date` are NOT in the list. The cast `(program as any).start_date ?? null` in `TrainingTab.tsx` line 746 therefore always passes `null` to `ClientProgramTwoPane`, which causes `derivePhaseDates(null, phases)` to return `start_date: null` for every phase — so the date-range `<p>` blocks never render. Only the existing `{duration_weeks}w · N workouts` line shows.

DB confirms the data exists:
- Jack Fisher (current client viewed): `start_date = 2026-05-05`
- Jordan Carmean: `start_date = 2026-05-03`
- 28 of 59 programs total have a `start_date` set.

## Fix (one-line change)
Update the SELECT in `useClientProgram.ts` line 96 to:

```
"id, name, description, goal_type, version_number, is_master, start_date, end_date, duration_weeks"
```

That's all it takes for dates to start rendering everywhere we already wired them:
- Program header range (top of TwoPane)
- Sidebar phase rows (date under each phase name)
- Phase detail header (`8 weeks (05 May 2026 - 29 Jun 2026)` + "Current / N days left" chip)

## What about programs with no start_date (~half of them)?
Those will still show only `{weeks}w` (current behavior, graceful degradation per the State B implementation). To make EVERY client show dates, we'd need a fallback to `client_program_assignments.created_at` as the program start. The user picked "Auto-derive from `programs.start_date`" only, so I will NOT add that fallback unless they ask — coach authority means we don't invent a start date the coach didn't set.

## Out of scope
- No DB / RLS changes
- No UI changes (rendering already in place from previous turn)
- No changes to `phaseDates.ts`, `ClientProgramTwoPane.tsx`, or `TrainingTab.tsx`

## Files touched
- `src/hooks/useClientProgram.ts` (line 96 only)

## Acceptance test
1. Open Jack Fisher's profile → Training tab → expect to see `05 May 2026 - …` under the program name and a date range under each phase.
2. Open Jordan Carmean → same.
3. Open Julian Lesnevich (no start_date in DB) → no date line, just `{weeks}w` (correct graceful fallback).
