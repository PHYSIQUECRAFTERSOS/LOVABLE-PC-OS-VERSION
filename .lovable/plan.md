

# Fix Plan: PR Detection, Cardio Buttons, Weight Log Visibility, Swipe Alignment

## Issue 1: False PR Detection (Same Weight + Same Reps)

**Root cause**: In `WorkoutLogger.tsx` line 431, the PR check logic uses:
```
if (prev.weight > weight || (prev.weight === weight && prev.reps >= reps))
```
This correctly blocks when historical reps are *greater or equal* at the same weight. However, the `personal_records` table check on line 423 uses `reps <= existingPR.reps` which should also block equal reps. The real problem is the `allTimeBests` array only contains sets from *completed* sessions. If the current session's exercise was done in the same workout earlier today (same session that was completed), the data may not include it yet.

Actually, re-reading the logic: `prev.reps >= reps` means "if previous reps are >= current reps at same weight, NOT a PR." This should correctly block 60x7 if 60x7 was done before. The issue is likely that the `allTimeBests` map doesn't include sets from the current in-progress session that were logged during this same workout. When a set is completed and marked as PR, it gets added to `prAlerts` but NOT to `allTimeBests`. So if the user does 60x7 on set 1 (flagged as PR), then 60x7 on set 2, the second check against `allTimeBests` (historical only) may still pass if the historical data didn't have 60x7.

Wait -- the user says they did 60x7 "in the past" and it still shows a PR. Let me re-check: the `allTimeBests` query filters by `workout_sessions.status = "completed"`. If the previous session with 60x7 was completed, it should be in `allTimeBests`. Unless the data wasn't loaded correctly.

More likely issue: the `allTimeBests` check iterates ALL historical sets and returns false only if `prev.weight > weight` OR `(prev.weight === weight && prev.reps >= reps)`. This means it returns false if ANY single historical set beats the current one. But it doesn't check the combined condition properly -- it needs to check if the SAME weight with >= reps exists. The current logic is: for each historical set, if that set's weight is strictly greater than current weight, block. Or if same weight and >= reps, block. This seems correct.

The real bug: the check says "not a PR if any historical set has equal or better performance" but the condition `prev.weight > weight` blocks when a HEAVIER weight was lifted before, even with fewer reps. That's wrong conceptually but also wouldn't cause false positives. Let me think again...

If historical has 60x7, and current is 60x7: `prev.weight === weight && prev.reps >= reps` → `60 === 60 && 7 >= 7` → true → return false. So it SHOULD block the PR. 

Unless the `allTimeBests` data doesn't include the previous 60x7 set. This could happen if:
1. The previous session wasn't marked as "completed"
2. The weight/reps were stored as null

I think the safest fix is to also add the current session's logged sets to the comparison, so within the same session, doing the same weight x reps twice doesn't trigger a second PR alert.

**Fix in `WorkoutLogger.tsx`**:
- In `checkPR`, also scan the current session's already-completed sets in `exercises` state to prevent false positives within the same session.
- Additionally, ensure the `>=` comparison is strictly correct: a PR should only trigger when the current set has STRICTLY more weight OR same weight with STRICTLY more reps than every historical entry.

## Issue 2: Cardio Popup Buttons Not Working

**Root cause**: `CardioPopup.tsx` line 230-241 uses `DrawerClose asChild` for the Cancel button and a plain `onClick` for Mark as Complete. This is the exact same pattern that broke `WorkoutStartPopup` -- vaul drawer drag gestures swallow tap events on mobile.

**Fix in `CardioPopup.tsx`**:
- Add `data-vaul-no-drag` to `DrawerFooter`
- Replace `DrawerClose asChild` with explicit `onClick` + `e.stopPropagation()` on both buttons (same pattern applied to WorkoutStartPopup earlier)

## Issue 3: Weight Log Form Hidden Below Viewport

**Root cause**: In `WeightHistoryScreen.tsx`, clicking "+ Log Weight" sets `showLogSheet = true` which renders the form at the bottom of a scrollable dialog. On mobile, the form appears below the fold and the user must scroll to see it.

**Fix in `WeightHistoryScreen.tsx`**:
- After `setShowLogSheet(true)`, use a `useEffect` or `setTimeout` to scroll the log form into view using `scrollIntoView({ behavior: "smooth" })`
- Add a `ref` to the log form container and call `.scrollIntoView()` when it appears

## Issue 4: Swipe-to-Delete Targets Wrong Food Item

**Root cause**: In `SwipeToDelete.tsx`, the touch event handling doesn't properly isolate to the specific element being touched. The swipe gesture can bleed to adjacent items because:
1. The `touchStart` sets `swiping = true` immediately (line 25), before direction is determined
2. There's no check to ensure the touch target is within the component's own bounds
3. If a swipe on the date navigator row is detected as horizontal, it could trigger the SwipeToDelete on a nearby food item

The more likely issue: the SwipeToDelete container has no `touch-action` CSS, so the browser's default touch handling can cause the wrong element to receive move events. Also, the date navigation area uses horizontal buttons that can interfere.

**Fix in `SwipeToDelete.tsx`**:
- Add `touch-action: pan-y` CSS to prevent horizontal scroll conflicts
- Only set `swiping` to true after confirming horizontal direction (move the direction lock to be evaluated before setting offset)
- Add a minimum horizontal movement threshold before engaging the swipe

## Technical Details

### Files to modify:
1. **`src/components/WorkoutLogger.tsx`** (lines ~418-449): Fix PR check to also scan current session's completed sets and ensure strictly-greater comparison
2. **`src/components/dashboard/CardioPopup.tsx`** (lines 230-241): Add `data-vaul-no-drag` and explicit `e.stopPropagation()`