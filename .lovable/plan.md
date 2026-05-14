## Goal

Make phase transitions unmistakable on the client workspace calendar (and the client-side `CalendarGrid`) by rendering a **full-width gold banner across the entire week row** the moment a new phase begins, plus a matching outlined pill on the previous phase's final day. Match Trainerize's "PHASE 4: FST 7…" treatment.

## Why the current markers don't show

`usePhaseBoundaries` renders inside cells as small `P2 starts` pills — but on Jack's calendar they aren't appearing at all. Verified DB state is correct (program start 2026-05-05, Phase 1 = 1 wk → ends May 11, "PHASE 2: Prep Mens physique" starts May 12, status `active`). The cells render as if `boundariesByDate` is empty. Two probable causes:

1. **RLS**: coach reading `client_program_assignments` for a client other than themselves may be blocked silently (hook returns no rows → empty boundaries).
2. **Race**: `usePhaseBoundaries` resolves after the grid renders and the memo doesn't re-run because `boundariesByDate` is a new Map identity but hidden behind a child boundary.

Fix: add the same defensive fallback pattern used for the workout dropdown (try the assignment query, on empty fall back to `programs` + `program_phases` directly via the `client_program_assignments` row already loaded by `useClientProgram`).

## Implementation

### 1. Robust data layer — `src/hooks/usePhaseBoundaries.ts`
- Accept an optional `seed` arg `{ programId, programStart, phases }` so callers that already loaded the program (e.g. `CalendarTab` via `useClientProgram`) can hydrate boundaries instantly with zero extra round-trips.
- Keep the existing fetch as fallback. Log a single `console.warn` when both paths return empty so future regressions are visible.
- Export `weekHasPhaseStart(weekStart, weekEnd)` helper that returns the **starting phase** if any phase begins in that week — used by the new banner.

### 2. Trainerize-style week banner

Both calendars need the same banner. Extract to `src/components/calendar/PhaseWeekBanner.tsx`:

```text
┌──────────────────────────────────────────────────────────────┐
│  ▌ PHASE 2: PREP MENS PHYSIQUE  ·  STARTS TUE MAY 12         │  ← gold bg, dark text
└──────────────────────────────────────────────────────────────┘
[ Mon 11 ] [ Tue 12 ] [ Wed 13 ] [ Thu 14 ] [ Fri 15 ] [ Sat 16 ] [ Sun 17 ]
```

- Renders **above** the 7-day cell row when any day in that week is a phase start date.
- Background: `bg-primary text-primary-foreground` (gold on black). Uppercase, tracking-wide, `font-bold`. Optional `Flag` icon at left.
- Text: full phase name from program (per your choice), with `· starts {weekday MMM d}` suffix in lighter weight.
- Click target: opens the program tab focused on that phase (nice-to-have; out of scope if it complicates things).

### 3. End-of-phase marker

On the previous phase's last day cell (e.g. May 11 for Phase 1):
- Outlined gold pill spanning the full cell width: `border border-primary/60 text-primary bg-primary/5`.
- Text: `PHASE 1 · ENDS TODAY` in tiny uppercase, with `Flag` icon.
- Cell also gets a `border-b-2 border-b-primary/60` so the bottom edge clearly visually closes the phase.

### 4. Files touched

- `src/hooks/usePhaseBoundaries.ts` — accept seed, add fallback log, export `findPhaseStartingInWeek`.
- `src/components/calendar/PhaseWeekBanner.tsx` — **new** shared banner component.
- `src/components/clients/workspace/CalendarTab.tsx` — render `<PhaseWeekBanner>` above each week row; replace inline `P2 starts` pill with the new full-width end-day pill; pass already-loaded program/phases as seed.
- `src/components/calendar/CalendarGrid.tsx` (client-side calendar) — render the same banner so clients see their own phase transitions.

### 5. Out of scope

- No DB schema changes.
- No changes to phase resolution logic for scheduling (already fixed last turn).
- No changes to mobile day-list view (markers there can be a follow-up).

## Verification checklist

After implementation I'll:
1. Reload Jack's workspace calendar in May 2026 and confirm a gold banner sits above the row containing May 12 with text `PHASE 2: PREP MENS PHYSIQUE · STARTS TUE MAY 12`.
2. Confirm May 11 cell shows the outlined `PHASE 1 · ENDS TODAY` pill and a gold bottom border.
3. Confirm prior weeks (no phase change) render normally with no banner.
4. Open the client-side `/calendar` route as Jack and confirm the same banner appears.
5. Check the console for the new warn — should be silent when data loads.

## Suggested follow-up improvements (ask before building)

- **Phase progress chip** in the month header: `Week 2 of 20 · PHASE 2` so the coach always sees current context.
- **"Jump to next phase"** arrow in the calendar toolbar that scrolls/navigates to the week containing the next phase start.
- **Mini phase ribbon** down the left edge of each week row colored per phase (Trainerize does this in their year view), making multi-month programs scannable at a glance.
- **Drag-to-reschedule guardrail**: when dragging a workout across a phase boundary, show a confirm toast `"This workout belongs to Phase 1 — move to Phase 2?"`.
