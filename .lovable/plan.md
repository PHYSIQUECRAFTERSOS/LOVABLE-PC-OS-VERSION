

## Fix: Scroll to active phase after saving a workout

### Problem
When saving a workout in the Program Detail View, `handleWorkoutSaved` calls `loadProgram()` on line 656, which reloads all phases and resets the scroll position to the top. The user loses their place, especially frustrating when working on Phase 2 or Phase 3.

### Fix
**File: `src/components/training/ProgramDetailView.tsx`**

1. Add a `ref` to track which phase index should be scrolled to after a reload (e.g. `scrollToPhaseRef = useRef<number | null>(null)`).

2. In `handleWorkoutSaved`, before calling `loadProgram()`, set `scrollToPhaseRef.current = builderTargetPhase`.

3. Add a `useEffect` that watches `phases` + `loading`: when loading finishes and `scrollToPhaseRef.current` is set, scroll the corresponding phase element into view, then clear the ref.

4. Add `data-phase-index={idx}` attributes to each phase container in the render section so we can target them for scrolling.

This is a scroll-only UX change — no database changes, no logic changes, no edge function changes.

