

# Plan: Workout Logger Visual Overhaul — Strong App Style

## Summary

Two layout changes to match the Strong app's workout logging UX:

1. **Remove the fixed bottom action bar** — "Add Exercises" and "Cancel Workout" buttons become inline content at the bottom of the exercise list, only visible when the user scrolls to the end.
2. **Push the sticky timer header flush against the top nav** — eliminate the gap between the AppLayout header and the workout timer/progress bar.

## Changes

### File: `src/components/WorkoutLogger.tsx`

**1. Move "Add Exercises" and "Cancel Workout" out of the fixed footer into the scroll flow**

Currently (lines 927-943): Both buttons are in a `fixed bottom-0` container that always overlays the screen, eating ~120px of viewport space.

Change: Move both buttons inline after the exercise cards, inside the scrollable `div`. Remove the `fixed` positioning entirely. They become regular content that appears after the last exercise card — exactly like Strong.

**2. Reduce bottom padding**

Currently: `pb-56` on the main container (line 823) to accommodate the fixed footer. Since the footer is gone, reduce to `pb-24` (just enough clearance above the mobile bottom nav).

**3. Make sticky header flush with the top app bar**

Currently (line 843): The sticky header has `pt-2 pb-3 -mx-4 px-4` with a bottom border. It sits below the AppLayout header with a visible gap due to the parent's `p-4` padding.

Change: Use negative top margin (`-mt-4`) and adjust padding so the sticky bar sits flush against the AppLayout header border. This creates a seamless "toolbar below navbar" look like Strong.

**4. Add PR alert banner styling**

The PR alerts (lines 884-892) currently use small badges. Keep as-is — they already match the screenshots well with the trophy icon.

### File: `src/components/workout/ExerciseCard.tsx`

No changes needed — the card layout already matches the Strong-style set grid.

## Visual Result

```text
┌─────────────────────────────┐
│ PHYSIQUE CRAFTERS   ⚙  ☰   │  ← AppLayout header (unchanged)
├─────────────────────────────┤
│ ↻  38:18           [Finish] │  ← Flush sticky timer bar
│ ████████░░░░░░░  5/20 sets  │
│ day 1: Pull day             │
├─────────────────────────────┤
│                             │
│  [Exercise Card 1]          │  ← Full viewport for exercises
│  [Exercise Card 2]          │
│  [Exercise Card 3]          │
│  ...                        │
│                             │
│  [+ Add Exercises]          │  ← Inline, only visible at scroll end
│  [Cancel Workout]           │
│                             │
└─────────────────────────────┘
│ 🏠  🍽  💬  📊  👤         │  ← Bottom nav (AppLayout)
└─────────────────────────────┘
```

## Files to modify
- `src/components/WorkoutLogger.tsx` — move buttons inline, flush sticky header, reduce padding

