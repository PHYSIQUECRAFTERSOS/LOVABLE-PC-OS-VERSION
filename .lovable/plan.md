# Fix: Prevent Data Loss on Tab Switch Across All Modals

## Analysis

Investigated all Dialog/Drawer/Sheet components. The WorkoutBuilderModal fix from the previous round is correct and in place. However, one other **critical** component has the exact same destructive pattern:

### ClientWorkoutEditorModal.tsx (HIGH RISK)

Lines 140-147 contain a `useEffect` that **unconditionally wipes all state when `open` becomes false**:

```typescript
useEffect(() => {
  if (!open) {
    setWorkoutName(""); setInstructions(""); setExercises([]);
    // ... clears everything
  }
}, [open]);
```

Line 273: `onOpenChange` calls `handleClose()` which can fire on focus events.

This is the same root cause as the original WorkoutBuilderModal bug. A coach editing an existing client workout (adding exercises, adjusting sets/reps) will lose all work if the Dialog's `onOpenChange(false)` fires during tab switch or focus loss.



## Plan

### File: `src/components/training/ClientWorkoutEditorModal.tsx`

1. **Remove the destructive `useEffect**` (lines 140-147) that wipes state when `open` becomes false
2. **Add a `savedSuccessfullyRef**` — only reset state after a successful save (same pattern as WorkoutBuilderModal)
3. **Fix `onOpenChange` handler** — just call `onClose()` instead of `handleClose()` to prevent the discard dialog from popping up on tab switch. Keep `handleClose` for the explicit X button only.
4. **Add** `discardAndClose` **function** — explicit user action to abandon changes, with state reset. make sure that Other components 
   like FoodLogger, AddExerciseModal, SupplementLogger, MealScanCapture, and CreateChallengeWizard do NOT close on reset or switching tabs,
5. **Add sessionStorage draft persistence** — same debounced pattern as WorkoutBuilderModal, keyed by `workoutId`

### File: `src/components/training/WorkoutBuilderModal.tsx`

No changes needed — the fix from the previous round is correct and complete.


| File                                                   | Change                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/components/training/ClientWorkoutEditorModal.tsx` | Remove destructive reset effect; add draft persistence; fix onOpenChange; add explicit discard button |
