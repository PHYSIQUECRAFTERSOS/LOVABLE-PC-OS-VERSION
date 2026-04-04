

## Trainerize-Style Mobile Workout Editor for Coach

**Context**: Currently, the coach's workout editing on mobile uses `ClientWorkoutEditorModal` — a desktop-oriented two-panel dialog (left workout structure + right exercise library). On mobile, this is cramped and unusable. The Trainerize screenshots show a much better mobile UX: fullscreen editor with a bottom toolbar (Superset, Delete, Insert) and a separate fullscreen "Add Exercises" sheet.

This change is **mobile-only** (coach role, `< 768px`). Desktop keeps the existing two-panel `ClientWorkoutEditorModal`.

### What Gets Built

**1. New Component: `MobileWorkoutEditor.tsx`**
A fullscreen mobile editor (replaces the dialog on mobile) with:
- **Header**: "Cancel" (left), workout name (center), "Save" (right) — matching Trainerize exactly (IMG_9584)
- **Instructions bar**: Collapsed single-line preview with edit icon, tapping opens a textarea sheet
- **Exercise list**: Each exercise card shows thumbnail, name, sets/reps/rest badges. Superset groups are visually linked with a left border. Drag handles for reorder via long-press.
- **Bottom toolbar** (sticky): 4 buttons — **Superset** | **Delete** | **Insert** (opens exercise catalog)
  - Superset: enters selection mode, select 2+, tap Superset again to group
  - Delete: enters selection mode, select exercises, confirm delete
  - Insert: opens fullscreen exercise picker sheet

**2. New Component: `MobileExercisePickerSheet.tsx`**
Fullscreen slide-up sheet (matching IMG_9585):
- Header: "Cancel" (left), "Add Exercises" (center), filter icon + "Add" (right)
- Search bar at top
- Exercise list with thumbnails, names, muscle/equipment tags, and checkbox on right
- Multi-select: check exercises, tap "Add" to insert all at once
- "+ Add custom exercise" link at bottom
- Muscle group filter via the filter icon

**3. Workout Preview Modal — Add 3-dot menu (mobile only)**
When coach taps a workout in `TrainingTab` on mobile, the `WorkoutPreviewModal` already shows. Add:
- **3-dot menu** (top-right, `MoreVertical` icon) with a bottom sheet containing:
  - Edit workout → opens `MobileWorkoutEditor`
  - Rename → inline rename dialog
  - Duplicate → clones workout + exercises
  - Delete → confirmation dialog then deletes
- Keep "Start Workout" button at bottom

**4. Integration in `TrainingTab.tsx`**
- Detect mobile via `useIsMobile()`
- When coach taps "Edit" on mobile → open `MobileWorkoutEditor` instead of `ClientWorkoutEditorModal`
- When coach taps workout card on mobile → preview modal now has the 3-dot menu
- Desktop behavior unchanged

### Files to Create
- `src/components/training/MobileWorkoutEditor.tsx` — fullscreen editor
- `src/components/training/MobileExercisePickerSheet.tsx` — exercise catalog picker

### Files to Modify
- `src/components/training/WorkoutPreviewModal.tsx` — add 3-dot menu with Edit/Rename/Duplicate/Delete (mobile only, coach only)
- `src/components/clients/workspace/TrainingTab.tsx` — route to mobile editor on mobile, pass new callbacks to preview modal
- No changes to `ClientWorkoutEditorModal.tsx` (desktop stays the same)

### Key Design Decisions
- Bottom toolbar uses the gold accent (`#D4A017`) for the active action
- Dark mode styling throughout (`bg-[#0a0a0a]`, `bg-[#1a1a1a]`)
- Exercise cards show: thumbnail (64x48), name, badges for sets/reps/rest
- Superset grouping uses left gold border like Trainerize
- Save persists to same Supabase tables (`workouts`, `workout_exercises`, `workout_sets`) using same logic as `ClientWorkoutEditorModal.handleSave()`
- Delete workout from 3-dot menu uses `AlertDialog` confirmation before deleting

### Not Included (per your instructions)
- Circuit button (skipped)
- Rest timer button (skipped — each exercise has rest already)

