## Goal

Stop auto-numbering workouts by their position in the phase. Display each workout's real name verbatim, and use the leading "Day N" found in that name to sort them chronologically. Anything that doesn't start with `Day N:` (e.g. `(tweaked groin) Day 5: …`, `[AWAY] Day 1: …`, `Stretches`) drops into a separate "Other" group below the chronological list — exactly like Trainerize.

## What changes

### 1. New helper `src/utils/workoutOrder.ts`
- `parseLeadingDay(name)` → `{ dayNumber: number | null, rest: string }`. Matches only a clean leading `Day\s*N\s*:` (no parentheses/brackets before it).
- `sortWorkoutsByName(items)` → returns `{ chronological, other }`. `chronological` is sorted by `dayNumber` ascending then by name; `other` is sorted alphabetically. Each item keeps its real `name` untouched.

### 2. Stop prepending positional `Day N:` everywhere
Update the three call sites that currently build labels with `withDisplayPositions` + `formatWorkoutDayLabel` + `normalizeWorkoutName`:

- `src/components/calendar/ScheduleEventForm.tsx` (the "Schedule Events → Link to Workout" dropdown in the screenshot)
- `src/pages/Calendar.tsx`
- `src/components/clients/workspace/CalendarTab.tsx` (two spots — workout select + event title resolution)

In each:
- Use the workout's stored `name` verbatim as the label (no `formatWorkoutDayLabel`, no `normalizeWorkoutName` stripping).
- Replace the current sort with `sortWorkoutsByName`, render `chronological` first, then an optional `── Other ──` separator (or just a blank disabled item) followed by `other`.
- Keep `sort_order` only as a tiebreaker inside `other` (so a coach's manual drag order still matters for unnumbered items).

### 3. Training-program workout list (screenshot 2)
`src/components/training/ProgramDetailView.tsx` (and `SortableWorkoutCard.tsx` / `ProgramList.tsx` if they format labels) currently order by `sort_order`. Switch the displayed order to the same `sortWorkoutsByName` result so `(Tweaked Shoulder) Day 3: Push` no longer floats above `Day 1: UPPER`. Drag-to-reorder is preserved for items in the "Other" bucket only — chronological items always render in Day-N order regardless of `sort_order`. (If you'd rather keep drag-to-reorder authoritative everywhere, tell me and I'll keep `sort_order` as the source of truth and only fix the calendar dropdowns.)

### 4. Leave alone
- DB schema, `program_workouts.sort_order`, `exclude_from_numbering`, `custom_tag` — unchanged. Renames take effect immediately because the order is derived from the live `name`.
- `formatWorkoutDayLabel` / `withDisplayPositions` stay in the repo for now (other surfaces like meal-plan day badges still use `withDisplayPositions`); only the workout-label call sites stop calling them.

## Result
- Renaming "Day 2: Neck" → "Day 2: Back" instantly re-sorts; renaming "Day 5: Push" → "Day 1: Push" moves it to the top automatically.
- `(tweaked groin) Day 5: legs B & calves & abs` and `(Tweaked Shoulder) Day 3: Push` show under "Other", not as `Day 1:` / `Day 2:` of the chronological list.
- The "Schedule Events → Link to Workout" dropdown in your screenshot will read: `Day 3: UPPER`, `Day 4: LOWER A …`, `Day 5: Push`, `Day 6: Pull`, `Day 7: legs B …`, then under Other: `(tweaked groin) Day 5: legs B …`, `(Tweaked Shoulder) Day 3: Push`.

Confirm and I'll implement — or tell me to keep drag-order authoritative in the program builder and only fix the calendar/scheduling dropdowns.
