

## Problem: Workout Logger Mounts Two Independent Instances

The client reports that during the finish flow, the workout "flipped out" back to the beginning with no data. 

**Root cause**: Both `Training.tsx` and `useWorkoutLauncher.tsx` render TWO separate `WorkoutLogger` components — one wrapped in `md:hidden` (mobile) and one in `hidden md:block` (desktop). CSS hiding does NOT prevent React from mounting both. Each instance independently:
- Creates or resumes a workout session
- Runs its own heartbeat timer
- Maintains its own exercise state
- Runs its own finish flow

When any lifecycle disruption occurs (app background/foreground, keyboard resize, viewport change), the two instances can conflict. If the visible instance completes the workout but the hidden instance's state is stale, or if a re-render swaps which instance is visible, the user sees blank exercise data from the unmodified instance.

## Fix

Consolidate to a **single WorkoutLogger instance** in a responsive container. Replace the dual-div pattern with one div that adapts to both mobile and desktop via responsive classes.

### File 1: `src/pages/Training.tsx` (lines 248-261)

**Before** (two instances):
```tsx
<div className="fixed inset-0 z-[55] ... md:hidden">
  <WorkoutLogger ... />
</div>
<div className="... hidden md:block">
  <WorkoutLogger ... />
</div>
```

**After** (single instance, responsive container):
```tsx
<div className="fixed inset-0 z-[55] bg-background overflow-y-auto safe-top pb-24 px-4 md:relative md:inset-auto md:z-auto md:pb-0 md:px-0 md:safe-top-0">
  <WorkoutLogger ... />
</div>
```

### File 2: `src/hooks/useWorkoutLauncher.tsx` (lines 109-135)

Same consolidation — replace the two-div/two-WorkoutLogger pattern with a single responsive container and single WorkoutLogger instance.

## What this fixes
- Eliminates duplicate session creation and heartbeats
- Eliminates state divergence between two component instances  
- Eliminates the possibility of seeing the "other" instance's blank state
- Fixes the "flipped back to beginning with no data" symptom

## What is NOT touched
- WorkoutLogger internals (finish flow, session restore, exercise state)
- UnfinishedWorkoutBanner logic
- Dashboard, Calendar, Messaging, Nutrition
- Database schema, RLS policies
- No new files created

## Testing
- Verify workout can be started and completed on mobile viewport
- Verify workout can be started and completed on desktop viewport  
- Verify resume from Unfinished Workout Banner restores logged sets
- Verify finish flow shows summary with correct stats
- Verify no duplicate sessions are created in the database

