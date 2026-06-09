# Workout Player: Group-Aware Visuals + Rest Timer

Make supersets, circuits, and giant sets immediately recognizable in the client's workout tracker, and fix rest-timer behavior so only the last exercise in a group fires a rest timer.

## What changes for the client

- Any exercises sharing a `grouping_id` (superset, circuit, or giant set) are visually paired:
  - Gold border around each card in the group.
  - A continuous gold rail on the left side that visually connects every card in the group (single rail, spans from the top of the first card to the bottom of the last).
  - A small gold pill on each card: `SUPERSET A · 1 of 2`, `CIRCUIT B · 2 of 3`, `GIANT SET A · 3 of 4`. Letter increments per group within the workout; "1 of N" indicates position inside the group.
- Rest timer behavior inside a group:
  - When the client logs a set on a non-last exercise in the group, no rest timer fires — they move straight into the next paired exercise.
  - When the client logs a set on the last exercise in the group, the rest timer fires using that last exercise's `rest_seconds`.
  - Solo (ungrouped) exercises behave exactly as today.

## Technical changes

**Data plumbing**
- `src/pages/Training.tsx` → `loadWorkoutExercises`: include `grouping_type` and `grouping_id` on each `exerciseLogs` entry (already returned by `fetchWorkoutExerciseDetails`).
- `src/components/WorkoutLogger.tsx` `ExerciseLogForm`: add `groupingType?: string | null` and `groupingId?: string | null`.

**Group metadata derivation (WorkoutLogger)**
- Build a memoized `groupMeta` map keyed by `exIdx`:
  - `groupId`, `groupingType`, `letter` (A, B, … assigned in order of first appearance), `indexInGroup` (1-based), `groupSize`, `isFirst`, `isLast`.
- A "group" requires both `groupingType` and `groupingId` and at least 2 members; lone members render as solo.

**Rest timer fix (`completeSet`)**
- If `groupMeta[exIdx].isLast === false` → skip `setRestTimer(...)` entirely (still complete + persist the set).
- If last (or solo) → fire with that exercise's own `restSeconds` (unchanged from today).

**Visual pairing**
- `ExerciseCard` accepts new props: `groupLabel?: string` (e.g. "SUPERSET A"), `groupPosition?: { index: number; total: number }`, `groupPosition` rail flags: `isFirstInGroup`, `isLastInGroup`, `isInGroup`.
- Card root: when `isInGroup`, apply `border-[#D4A017]` (replacing default border) and `relative` positioning.
- Render the pill at the top of the card: `SUPERSET A · 1 of 2` styled `bg-[#D4A017]/15 text-[#D4A017] border border-[#D4A017]/40` rounded-full, uppercase tracking-wide.
- Connecting rail: absolutely positioned 3px-wide gold bar on the left edge of the card.
  - Top is flush with card top when not first; otherwise rounded.
  - Bottom is flush with card bottom when not last; otherwise rounded.
  - Extends 8px below the card (`-bottom-2`) on non-last cards so it visually bridges the gap between stacked cards (cards in `WorkoutLogger` are stacked in a vertical flex; gap is consistent).
- Label text per `grouping_type`: `superset` → "SUPERSET", `circuit` → "CIRCUIT", `giant` / `giant_set` → "GIANT SET", any other value → uppercased value.

**Resume sessions**
- `loadWorkoutExercises` already runs the same path on resume, so grouping props flow through naturally.

**No DB or RLS changes.** Read-only use of existing `grouping_type` / `grouping_id` columns.

## Files touched

- `src/lib/workoutExerciseQueries.ts` — no change (already selects grouping fields).
- `src/pages/Training.tsx` — map `grouping_type` / `grouping_id` into `exerciseLogs`.
- `src/components/WorkoutLogger.tsx` — extend `ExerciseLogForm`, compute `groupMeta`, gate rest timer, pass new props to `ExerciseCard`.
- `src/components/workout/ExerciseCard.tsx` — new props, gold border, pill, left rail.

## Verification

1. Open a workout that has a superset (e.g., the screenshot's "machine seated tricep pushdown" + "Close Grip Push Ups").
2. Confirm both cards show gold border, pill `SUPERSET A · 1 of 2` and `· 2 of 2`, and a continuous gold rail connecting them.
3. Log a set on the tricep pushdown → no rest timer appears, client can immediately log the push-up set.
4. Log a set on Close Grip Push Ups → rest timer fires with the push-up's `rest_seconds` (e.g., 90s).
5. Solo exercises still fire a rest timer using their own `rest_seconds`.
6. A 3-exercise giant set behaves the same: only the 3rd exercise fires rest.
