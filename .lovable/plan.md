
## What's actually broken (verified against your data)

I pulled the last 12 AI-import jobs for this account. The results changed the picture significantly from what your message described, so here's the honest breakdown before the fix list:

### 1. Meal Plan AI Import — "Save failed"
**This is NOT a network or upload error anymore.** The upload bug from last round is fixed (recent supplement imports for the same filename are completing). The new failure on `Julian meal plan.pdf` is:

```
null value in column "day_type" of relation "meal_plans"
violates not-null constraint
```

Root cause is the change we shipped last loop. When a template has **two days of mixed types** (one Training + one Rest), the code intentionally sets `meal_plans.day_type = null` so it can slot into either pill on the client side. But the column is `NOT NULL DEFAULT 'training'` — passing an explicit `null` overrides the default and the insert is rejected.

**Fix:** stop passing `null` for the parent row. For mixed two-day templates, set the parent `day_type` to `'training'` (a safe default — the actual per-day classification still lives on `meal_plan_days.day_type`, which is what the client tabs read). Single-classification templates already work and stay unchanged.

### 2. Supplement AI Import
The 2 most recent supplement runs **completed successfully** ("done" status). If you saw a failure in the same session, it was almost certainly the same null-default class of bug propagating, or you were on a stale tab before the upload fix deployed. I'll re-test after the meal fix and confirm both work end-to-end on the same `[bi weekly] Jose Lopez` file you've been using.

### 3. AI Import — Rest timers still showing 60s on mobility / supersets
The screenshot you sent ("upper body mobility routine — Rest 60") is the **Edit Workout** modal for a workout that already lives in the database. The rest-redistribution fix from last loop only affects **new imports going forward** — it does not retroactively rewrite rows that were imported before the fix shipped. A few things I want to do here:

- Re-verify the new import path on a fresh import of the Jose Lopez PDF and capture the `[ai-import][rest]` debug logs so we have proof the new path writes `0` for mobility and `0/group_rest` for supersets.
- Add a tiny "Reset rest to 0" bulk action in the workout editor for any workout you imported before the fix, so you can clean up the old data without rebuilding it from scratch.
- If the new import still produces 60s anywhere, that means the model is sometimes returning `60` literally instead of `null`. I'll tighten the prompt with explicit anti-default language and add a server-side guard in the edge function: if a row is part of a `superset_groups` block, force its `rest_seconds` to `null` server-side before sending the extracted JSON back to the client.

### 4. Workout editor — hamburger doesn't actually drag
Confirmed. The `GripVertical` icon in `ClientWorkoutEditorModal.tsx` and `MobileWorkoutEditor.tsx` is purely decorative — it's a static icon with `cursor-grab` styling and no drag handlers attached. The only reorder mechanism is the up/down chevron buttons that move one slot at a time. That's why dragging from the bottom to the top does nothing.

The codebase already uses `@dnd-kit` correctly elsewhere (`ProgramDetailView` for reordering workouts in a phase, `SortableWorkoutCard` for the two-pane client view). I'll port the same pattern into the exercise editor.

### 5. Workout Builder — wider preview
You want 6 exercises visible at once on desktop in the workout builder so you can drag from position 10 to position 1 without paginating. Currently the editor renders one tall card per exercise. I'll compact the per-row layout on desktop (≥1024px) so 6 fit in the visible scroll area, while keeping the mobile layout untouched.

---

## Implementation plan

### A. Fix meal import save failure (highest priority — actively broken)
**File:** `src/components/import/AIImportModal.tsx` (`saveMealPlan`)
- Replace the `planDayType = uniqueTypes.length === 1 ? uniqueTypes[0] : null` line.
- For mixed templates: pass `day_type: 'training'`, `day_type_label: 'Training Day'` (matches the column default and never violates the NOT NULL).
- The per-day classification on `meal_plan_days.day_type` is unchanged — that's what powers the Training/Rest pills on the client meal-plan tab, so behavior on the client side is identical.
- Verify with a fresh import of `Julian meal plan.pdf`.

### B. Verify + harden the AI rest-timer parser
**Files:** `supabase/functions/ai-import-processor/index.ts`, `src/components/import/AIImportModal.tsx`
- Re-run the Jose Lopez import with `VITE_DEBUG_AI_IMPORT=true` so the `[ai-import][rest]` logs print and we can confirm mobility rows resolve to `0` and superset rows redistribute correctly.
- Add a server-side normalization step in the edge function: after extraction, walk every day's exercises, and for any exercise whose `grouping_id` appears in `superset_groups`, force its `rest_seconds` to `null` regardless of what the model returned. This way a hallucinated `60` on a superset member can never reach the database.
- Tighten the prompt with one extra line: "If you're tempted to write `60` as a default, write `null` instead. There is no default."
- Add a small **"Reset all rests to PDF defaults"** button in the workout editor toolbar (visible only when the workout was AI-imported — we can detect this via the existing `is_template` + recent-creation heuristic, or store a `source: 'ai_import'` flag on workouts going forward). One click sets every `rest_seconds` to 0 so you can quickly clean up legacy imports.

### C. Real drag-and-drop in workout editors (mobile + desktop)
**Files:** `src/components/training/ClientWorkoutEditorModal.tsx`, `src/components/training/MobileWorkoutEditor.tsx`
- Wrap the exercise list in `<DndContext>` + `<SortableContext>` from `@dnd-kit` (already a project dependency, used in `ProgramDetailView`).
- Convert each exercise card to a `useSortable`-driven component; attach `listeners` + `attributes` to the `GripVertical` icon so it becomes the drag handle.
- On `onDragEnd`, use `arrayMove` to reorder, then re-stamp `exerciseOrder` on every row, then trigger the existing autosave (mobile) or mark `hasChanges` (desktop).
- Sensors: `PointerSensor` for desktop, `TouchSensor` (with 250ms long-press activation) for mobile to avoid breaking scroll. Same config as `ProgramDetailView`.
- Keep the up/down chevrons as a fallback for accessibility — they're still useful for fine 1-position adjustments.

### D. Widen the workout builder preview to fit ≥6 exercises on desktop
**File:** `src/components/training/ClientWorkoutEditorModal.tsx` (and `WorkoutBuilderModal.tsx` if you also want it in the master library builder — confirm in the questions below)
- Currently each exercise row uses ~140px vertical space (image + name + inline fields + notes). On a 90vh dialog at 1378px (your viewport) that yields ~3–4 visible rows.
- Compact desktop layout (≥1024px only):
  - Collapse the inline-fields row + notes row into a single 1-line row using a denser grid.
  - Drop the per-row notes input down to an icon-button that expands inline only when clicked.
  - Reduce the per-row vertical padding from `p-3` to `py-1.5`.
- Target: 6 exercises visible without scrolling on a 1080p+ display, drag-target much larger.
- Mobile layout is unchanged — the existing card layout works at 375px.

---

## Files I will touch

1. `src/components/import/AIImportModal.tsx` — meal `day_type` default fix; optional "is_ai_import" flag pass-through.
2. `supabase/functions/ai-import-processor/index.ts` — server-side superset rest normalization; one-line prompt tightening.
3. `src/components/training/ClientWorkoutEditorModal.tsx` — `@dnd-kit` integration; compact desktop row layout.
4. `src/components/training/MobileWorkoutEditor.tsx` — `@dnd-kit` integration with `TouchSensor`.
5. *(Optional, see Q1)* `src/components/training/WorkoutBuilderModal.tsx` — same dnd + compact layout for master-library builder.

## What I will NOT do without your sign-off
- No schema change to `meal_plans.day_type`. The current NOT NULL with default `'training'` is fine; I'm fixing the client to respect it.
- No automatic backfill of old workouts' rest values. I'll give you a one-click reset button instead so you stay in control of which workouts get rewritten.
- No change to the up/down chevron buttons — drag is added, chevrons stay as a fallback.

## Quick clarifying questions before I start

1. **Apply the same DnD + compact layout to the master-library `WorkoutBuilderModal` too?** You only mentioned the client-side editor in the screenshots, but the same pain probably exists when you build a fresh workout in Master Libraries. I recommend yes — same fix, same files pattern.

2. **Mobility 60s cleanup:** Do you want me to also add a one-time SQL migration that resets `rest_seconds = 0` on every exercise where the workout name contains "mobility" / "warmup" / "stretching"? That would clean up your existing imported library in one shot without any clicking. Otherwise the new "Reset rests" button in the editor lets you do it per workout.

3. **For mixed two-day meal templates,** confirming the parent `meal_plans.day_type` should default to `'training'` (not `'rest'`) when the template contains both. The actual day-level classification is preserved on `meal_plan_days` either way, so the client tabs render correctly — this only affects what shows up on the parent template card in Master Libraries.
