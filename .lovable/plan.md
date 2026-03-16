

# Fix: Program Builder Workout Creation + Auto-Save for Workout Builder

## Issue 1: "Add Workout" in New Program Only Shows Template Picker

**Root Cause**: `ProgramBuilder.tsx` (used when creating a NEW program via "New" button in Master Libraries) uses a simple `Dialog` that lists only existing workout templates. It does NOT use `WorkoutBuilderModal` which allows building workouts from scratch with exercises.

In contrast, `ProgramDetailView.tsx` (used when clicking back into an existing program) correctly uses `WorkoutBuilderModal` with full exercise library access.

**Fix**: Replace ProgramBuilder's template-only picker dialog with `WorkoutBuilderModal`, matching the ProgramDetailView pattern. This means:
- Import and render `WorkoutBuilderModal` in ProgramBuilder
- Add state for `showWorkoutBuilder`, `builderTargetPhaseIdx`, `builderTargetWeekIdx`
- When "Add Workout" is clicked, open WorkoutBuilderModal instead of template picker
- On save callback, add the created workout to the target week
- Keep the existing template picker as a secondary "Import Existing" option

## Issue 2: Workout Builder Loses State When Switching Browser Tabs

**Root Cause**: `WorkoutBuilderModal.tsx` lines 221-228 has a `useEffect` that resets ALL state when `open` becomes false:
```typescript
useEffect(() => {
  if (!open) {
    setWorkoutName(""); setInstructions(""); setExercises([]);
    // ... clears everything
  }
}, [open]);
```

The `Dialog` component may briefly unmount/remount or toggle `open` when the browser tab loses focus (visibility change), causing total state loss.

**Fix**: 
1. Add `sessionStorage` persistence for workout builder draft state (name, instructions, exercises, toggles) keyed by `editWorkoutId` or `"new"` 
2. Save to sessionStorage on every state change (debounced)
3. On mount, restore from sessionStorage if draft exists
4. Clear sessionStorage only on successful save or explicit close/cancel
5. Guard the reset effect to only run on intentional close, not visibility changes

## Files Changed

| File | Change |
|------|--------|
| `src/components/training/ProgramBuilder.tsx` | Replace template picker with WorkoutBuilderModal; add "Build Workout" + "Import Existing" options |
| `src/components/training/WorkoutBuilderModal.tsx` | Add sessionStorage draft persistence; fix reset logic to prevent tab-switch data loss |

