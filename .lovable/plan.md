

# Fix: Workout Builder Tab-Switch Data Loss + Direct Builder Access

## Problems Identified

### 1. Exercises disappear on tab switch
**Root cause**: `WorkoutBuilderModal.tsx` line 502 — the `Dialog`'s `onOpenChange` handler calls `clearDraftAndClose()`, which:
- Removes the sessionStorage draft
- Sets `intentionalCloseRef = true`
- Triggers the state-reset `useEffect` (line 257-265)

Any scenario where the Dialog fires `onOpenChange(false)` — focus loss, Radix internal checks, or parent re-render — wipes everything AND deletes the backup draft. The "safety net" destroys itself.

### 2. "Add Workout" requires extra click
User chose "Builder first" — skip the choice dialog and open the workout builder directly. Keep "Import Existing" as a secondary option.

## Fix Plan

### File: `src/components/training/WorkoutBuilderModal.tsx`

**A. Stop clearing draft on Dialog close (the critical fix)**
- Change `onOpenChange` handler: just call `onClose()` without clearing draft or setting intentionalCloseRef
- Remove `clearDraftAndClose` function entirely
- Only clear sessionStorage draft on **successful save** (already done on line 485)
- Change the state-reset `useEffect`: instead of checking `intentionalCloseRef`, use a new `savedSuccessfully` ref that's only set in `handleSave`
- Add explicit "Discard & Close" button in the header for intentional abandonment

**B. Restore draft even for `editWorkoutId` workouts**
- Currently line 241 skips restore when `editWorkoutId` is set. This means edits to existing workouts aren't protected. Change: restore draft for all workouts, but only if draft exists and is newer than DB data.

### File: `src/components/training/ProgramBuilder.tsx`

**C. Open builder directly on "Add Workout"**
- Change `openWorkoutPicker` to set `showWorkoutBuilder = true` directly (skip `showAddChoice` dialog)
- Add a small "Import Template" button beside the "Add Workout" button in each week for quick template import
- Remove or keep the choice dialog as unused (remove to clean up)

## Technical Details

```text
Current flow (broken):
  Tab switch → Dialog onOpenChange(false) → clearDraftAndClose()
    → sessionStorage.removeItem(draft)
    → intentionalCloseRef = true
    → onClose() → open=false
    → useEffect sees !open + intentionalCloseRef → wipes all state
    → Draft gone, state gone, no recovery

Fixed flow:
  Tab switch → Dialog onOpenChange(false) → onClose()
    → open=false
    → useEffect sees !open but savedRef=false → state preserved
    → Draft still in sessionStorage
    → Re-open → state still in React, draft as backup

  Explicit cancel → user clicks X/Discard → clearDraft + resetState
  Successful save → handleSave clears draft + resets state
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/training/WorkoutBuilderModal.tsx` | Fix Dialog close handler; only clear draft on save/explicit discard; protect state on tab switch |
| `src/components/training/ProgramBuilder.tsx` | Open builder directly; add inline "Import" option; remove choice dialog |

