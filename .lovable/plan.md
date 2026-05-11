## Goals
1. Prevent accidental data loss in the AI Create Program modal — only Discard / X / Approve & Save can close it.
2. Fix the modal so all generated workout days are scrollable (currently only Push is visible).
3. Apply new rest-time rules: 120s default for every exercise, 60s for ab/core exercises.
4. Auto-prepend a mobility routine at the top of every workout day, based on day type.

## Modal Behavior Fix (`AICreateProgramModal.tsx`)

- Add `onInteractOutside={(e) => e.preventDefault()}` and `onPointerDownOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}` to `<DialogContent>`. The modal can only be closed by the X button (already in DialogContent), the Discard button, Cancel, or after a successful Save.
- Keep the existing `onOpenChange` so the X / Discard / Cancel buttons still work normally.

## Scroll Fix

- Current layout: `DialogContent` is `max-h-[90vh] overflow-hidden flex flex-col`, with `<ScrollArea className="flex-1 -mx-6 px-6">` wrapping the days.
- Issue: the rationale Card + Days + Volume Card all live inside the ScrollArea, but the ScrollArea's flex child isn't getting a constrained height because the Radix ScrollArea viewport needs `min-h-0` on its flex parent chain.
- Fix:
  - Add `min-h-0` to the ScrollArea wrapper so it actually constrains and scrolls.
  - Ensure `DialogContent` keeps `flex flex-col` and `max-h-[90vh]`.
  - Ensure the footer (Discard / Regenerate / Approve & Save) stays pinned outside the ScrollArea (already is).

## Rest Time Rules (in edge function `ai-generate-program/index.ts`)

Update the system prompt + add a deterministic post-process pass after the AI returns the program (so it's enforced even if the model drifts):

```
function isAbExercise(ex):
  name = ex.name.lowercase()
  muscle = (ex.primary_muscle || "").lowercase()
  nameMatch = /\b(ab|abs|core|crunch|plank|sit[- ]?up|leg raise|hanging|cable crunch|hollow|dead bug|woodchop|russian twist)\b/
  muscleMatch = muscle in {"abs","core","abdominals","obliques"}
  return nameMatch.test(name) || muscleMatch
```

For every exercise (except mobility drills, see below):
- if `isAbExercise(ex)` → `rest_seconds = 60`
- else → `rest_seconds = 120`

Also update the J3U system prompt rest-time guidance to match.

## Mobility Drill Auto-Prepend

Day classification (by `day.day_label` keyword match, case-insensitive — uses user's confirmed keywords):

- **Upper** (use `upper body mobility routine`): label contains any of `pull`, `push`, `upper`, `chest`, `arm`, `back`
- **Lower** (use `lower body mobility routine`): label contains any of `leg`, `lower`, `glute`, `hamstring`, `quad`, `calves`, or both shoulder+leg ("shoulder" + "leg")
- **Full body** (use `Full Body Mobility Routine`): label contains `full body` or `full-body`
- If a day matches both upper and lower keywords (e.g. "Shoulders & Legs"), prefer **Lower**.
- If no match, default to **Full Body**.

For every day, after generation in the edge function:
1. Look up the chosen mobility exercise name in the coach's exercise library (using existing fuzzy matcher in `fuzzy.ts`). Library is already passed into the function.
2. If found, prepend an exercise row at index 0:
   - `name`: matched library name
   - `sets`: 1
   - `reps`: `"10/exercise"`
   - `rest_seconds`: 0
   - `notes`: `"1 set, 10 reps per exercise"`
   - `is_amrap`: false
   - `exercise_id`: matched id
   - `primary_muscle`: from library row (so it doesn't get counted in the hypertrophy volume targets — mobility shouldn't affect the volume validator)
3. Skip the rest-time normalization (step above) for these mobility rows so they stay 0s.
4. Exclude mobility rows from the J3U volume validator (already volume-based on `primary_muscle`; if mobility's primary_muscle is e.g. "mobility" or null, it naturally won't hit the muscle targets, but add a safety filter that ignores rows where `notes` includes "mobility" or `name` matches the three mobility names).

Also add to the system prompt: "Do NOT include warmups or mobility drills — they will be added automatically by the system."

## Scope Notes
- Only modal closing behavior, scroll layout, rest times, and the mobility prepend change.
- "Apply to current preview": user chose **only new generations**, so no migration of currently-displayed data is needed. Regenerate will pick up new rules.
- No DB schema changes. No RLS changes.
- No changes to save-pipeline (calendar_events, program_phases, workouts, workout_exercises) — the new mobility rows flow through the existing save loop as normal exercises with `exercise_id` already resolved.

## Files to Edit
- `src/components/training/AICreateProgramModal.tsx` — close-guard handlers + scroll `min-h-0`.
- `supabase/functions/ai-generate-program/index.ts` — system prompt updates + post-process rest normalization + mobility prepend (uses existing library list + `fuzzy.ts`).

## Verification
- Open AI Create → click outside / press Escape → modal stays open.
- Click X / Discard → modal closes.
- Generate a 5-day program → scroll inside modal → see all 5 days plus volume summary.
- Inspect generated rows: every non-ab exercise shows 120s rest, ab exercises show 60s rest, mobility row at top of each day shows 0s rest with the correct upper/lower/full-body name.
- Save → calendar_events still create correctly across 8 weeks.
