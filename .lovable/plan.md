
## Problem

Manny Paiz's PDF contains 6 workouts whose names overlap:

- `(tweaked groin) Day 5 : legs B & calves & abs`
- `(Tweaked Shoulder) Day 3: Push`
- `Day 1: UPPER`
- `Day 2: Lower` (and likely repeats further in the PDF)
- `Day 3: Push`
- `Day 5: legs B & calves & abs`

Two failures in `src/lib/ai-import/trainerizeWorkoutParser.ts`:

1. `HEADING_RE` only accepts `Day N: …`, `[AWAY] Day N: …`, or `stretches`. Lines starting with a parenthetical prefix like `(tweaked groin) Day 5 : …` are rejected, so those whole workouts vanish from the boundary summary and get merged into whichever Day-N block the AI picks.
2. Even when two headings share a canonical name, `extractTrainerizeWorkoutSummary` builds `uniqueNames` by dedup and emits one workout per unique name. Two real "Day 5" sections collapse into one.

## Fix

Edit only `src/lib/ai-import/trainerizeWorkoutParser.ts` (plus its unit test). Edge function behavior is unchanged — the deterministic JSON it already trusts simply now contains the right boundaries.

1. Expand `HEADING_RE` / `canonicalHeading` to accept an optional leading parenthetical OR bracketed tag before `Day N`. Preserve that prefix verbatim in the returned heading so two variants stay distinct, e.g. `(tweaked groin) Day 5: legs B & calves & abs` and `Day 5: legs B & calves & abs` are different names.
2. Stop deduping headings. Replace the `uniqueNames` loop with one that walks `headingHits` in order and slices the lines between heading `i` and heading `i+1`. Each hit becomes its own `ParsedWorkout`, so two identical "Day 1: UPPER" headings produce two workouts with their own exercise lists.
3. When two emitted workouts end up with identical `day_name`, append ` (2)`, ` (3)`, … to later occurrences so downstream UIs and Supabase rows stay unique while preserving the original wording for the first one.
4. Update `schedule` to mirror the emitted workouts in PDF order (it already does — verify with the new ordering).

## Verification

- Extend `trainerizeWorkoutParser.test.ts` with a fixture mirroring Manny's PDF: two `Day 1: UPPER`, two `Day 2`, two `Day 3` (one prefixed `(Tweaked Shoulder)`), and one `(tweaked groin) Day 5`. Assert the parser returns 7 workouts, that prefixed variants keep their prefix, and that duplicate plain names get `(2)` suffixes with the correct exercise list each.
- Re-run the existing Lee 4-day and 9-workout fixtures to confirm no regression.

## Technical notes

- `HEADING_RE` becomes something like `/^(?:\([^)]+\)\s*)?(?:\[\s*away\s*\]\s*)?day\s*\d+\s*:.*|stretches$/i`.
- `canonicalHeading` keeps the parenthetical untouched (no lowercase, no strip) so the user sees the same wording as in the PDF.
- The segment slicer uses `headingHits[i].index` → `headingHits[i+1].index ?? lines.length`, eliminating the `firstByName` map entirely.
- Suffix logic runs after parsing so `(tweaked groin) Day 5 …` and `Day 5 …` (different strings) are not renumbered.

No DB migration, no edge-function change, no other component touched.
