

## Plan: Remove Week Sub-Grouping, Add Duration Editor, Fix Shared Menu

### Problem Summary
1. **ProgramBuilder** (Master Libraries → New) uses a "Week 1, Week 2..." sub-grouping inside each phase. You don't rotate workouts weekly — same workouts run 6-8 weeks. The week sub-grouping is unnecessary clutter.
2. **Duration (weeks) is not editable** in ProgramBuilder — it's auto-calculated from the number of week sub-cards. Need an explicit editable duration input instead.
3. **ProgramDetailView** (Master Libraries → existing program detail) already has a flat workout list with editable duration — this is the correct model.
4. **TrainingTab** (Client profile → Training) also uses weeks in some paths — needs the same flat structure.
5. **3-dot menu on program sidebar** uses `opacity-0 group-hover:opacity-100` which hides it completely on touch devices. The menu with "Share with Team" / "Make Private" exists in code but is invisible without hover. Bug is CSS-only.
6. **Auto-save** for duration changes needs to work in ProgramDetailView (already has phase autosave) and ProgramBuilder (already has autosave for edit mode).

### Changes

**File 1: `src/components/training/ProgramBuilder.tsx`** — Remove week sub-grouping, add duration input

This is the biggest change. The ProgramBuilder currently nests workouts inside `weeks[]` arrays within each phase. We need to flatten this to match `ProgramDetailView`'s approach:

- Change `ProgramPhase` interface: remove `weeks: ProgramWeek[]`, add flat `workouts: WeekWorkout[]` array
- Remove `ProgramWeek` interface and all week operations (`addWeekToPhase`, `removeWeekFromPhase`, `duplicateWeekInPhase`)
- Add an editable "Duration (weeks)" number input in the phase settings grid (next to Phase Name, Training Style, etc.)
- Update `addPhase` to create phases with `workouts: []` and `durationWeeks: 4` (editable)
- Update `saveProgram` to save `phase.durationWeeks` directly (not calculated from week count), and insert workouts linked directly to `phase_id` in `program_workouts` (not via `week_id`)
- Update autosave snapshot builder and draft restore
- Update the UI: remove the nested Week collapsibles, show workouts flat under each phase with "Build Workout" and "Import" buttons directly
- Keep the "Build Workout" modal and "Import from templates" flows — just remove the week wrapper

**File 2: `src/pages/MasterLibraries.tsx`** — Fix 3-dot menu visibility

The dropdown trigger div uses `opacity-0 group-hover:opacity-100` which doesn't work on touch/mobile. Fix:
- Change to `opacity-60 hover:opacity-100` so it's always visible (dimmed when not hovered)
- This makes "Share with Team" / "Make Private" accessible on all devices

**File 3: `src/components/clients/workspace/TrainingTab.tsx`** — Verify flat workout structure

The TrainingTab already loads workouts via `directWorkouts` on phases (line 32). It also has a `weeks` fallback for legacy data. No structural changes needed — it already renders flat. Just verify the "New" workout button inside a phase creates workouts linked to `phase_id` directly (not via weeks). This is already the case.

### What Won't Change
- `ProgramDetailView.tsx` — already has the correct flat structure with editable duration and autosave
- `WorkoutBuilderModal.tsx` — no changes needed
- Database schema — no migrations needed. `program_workouts` already supports `phase_id` directly (without `week_id`). `program_weeks` table stays for legacy data but new programs won't create week rows.

### Technical Details

The key structural change in ProgramBuilder:

```text
BEFORE (current):
Phase → Week 1 → [Workout A, Workout B]
      → Week 2 → [Workout A, Workout B]
      → Week 3 → [Workout A, Workout B]

AFTER (target — matches ProgramDetailView):
Phase → [Workout A, Workout B]
         Duration: 6 weeks (editable input)
```

The save logic changes from:
- Insert `program_weeks` rows, then `program_workouts` with `week_id`

To:
- Insert `program_workouts` with `phase_id` directly (no week rows)
- Store `duration_weeks` on `program_phases` from the input value

This matches how `ProgramDetailView.saveProgramWithPhases()` already works (lines 1048-1117).

