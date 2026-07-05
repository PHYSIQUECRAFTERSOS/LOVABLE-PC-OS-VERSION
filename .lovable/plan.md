# Fix Meal Plan & Training PDF Exports

Two isolated bugs in the PDF export utilities. No schema or business‑logic changes.

## 1. Meal Plan PDF — wrong macros in header

**File:** `src/utils/pdf/exportMealPlanPdf.ts`

**Problem:** Cover/day header shows `plan.target_calories/protein/carbs/fat` from `meal_plans`. Those numbers are stale defaults (e.g. 2000/150/200/60) and don't match the "Nutrition Goal" the coach sees in the builder (e.g. 1716/181/137/48), which is the actual sum of the foods in that day.

**Fix:** Replace the stats‑row source with the computed totals from the day's `meal_plan_items`. Same math already exists a few lines below as the `totals`/`mt` variables — just use those numbers directly:

```ts
y = drawStatsRow(doc, [
  { label: "Calories", value: `${Math.round(totals.cals)}` },
  { label: "Protein",  value: `${Math.round(totals.p)}g` },
  { label: "Carbs",    value: `${Math.round(totals.c)}g` },
  { label: "Fat",      value: `${Math.round(totals.f)}g` },
], y);
```

Meal Total / Day Total rows already use item sums and are correct — leave them.

## 2. Training PDF — every day shows "No exercises defined"

**File:** `src/utils/pdf/exportTrainingPdf.ts`

**Root cause (confirmed against schema/RLS):** the query only fetches `program_workouts` by `phase_id`:

```ts
.from("program_workouts").select(...).in("phase_id", phaseIds)
```

But `program_workouts` can be linked either via `phase_id` **or** `week_id` (see `program_weeks` table and the workout_exercises RLS which coalesces both). Detached client programs commonly attach workouts through `week_id`, so this query returns 0 rows → `workoutIds` is empty → `workout_exercises` query is skipped → every day renders "No exercises defined". The app itself uses `useClientProgram.ts` which handles both paths, which is why the UI shows 9/7/9/8 exercises correctly.

**Fix:**

1. Also fetch `program_weeks` for the phases, then query `program_workouts` with `phase_id IN (...) OR week_id IN (...)` (two queries + merge, or `.or(...)` filter).
2. When building the phase's workout list, include rows whose `phase_id` matches OR whose `week_id` belongs to any of the phase's weeks.
3. Keep the existing `workout_exercises` fetch — it will now receive real workout IDs.

## 3. Training PDF — layout polish

Same file, presentation‑only changes:

- **Superset grouping:** sort exercises so rows sharing a `superset_group` render as an indented block under a small "Superset A" sub‑heading (instead of a `[SS A]` tag on the name column).
- **Day card:** wrap each day in a light bordered block with a colored left rule (gold) so days visually separate on the page.
- **Header row:** slightly larger day title, right‑aligned meta chip showing `N exercises · est XX min` (reuse `estimateWorkoutMinutes` from `src/lib/workoutMeta.ts`).
- **Reps/Intensity columns:** widen `Reps` and `Notes`, tighten `Tempo`; show `RIR X` / `RPE X` / `X%` inline with a subtle gray label.
- **Coach notes:** render inside a shaded callout box under the table instead of a plain gray line.
- **Page breaks:** ensure a day never splits across pages if it fits — measure table height before drawing and call `newContentPage(doc)` if the remainder is too small.

No changes to `brandedPdf.ts` primitives beyond adding one small helper for the shaded callout if needed.

## Out of scope

- No DB migrations.
- No changes to `exportSupplementsPdf.ts`.
- No changes to the in‑app builder or nutrition targets — the "Nutrition Goal" number in the app already comes from item sums; we're just aligning the PDF to match.
