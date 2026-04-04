

## Add Safe-Area Background to Workout Logger Overlay

**Problem**: On iOS devices with a notch/Dynamic Island, there's a visible gap between the top of the screen and the workout timer bar. The area behind the notch shows the default background or the AppLayout header peeking through, which looks unfinished.

**Solution**: When the workout logger is active on mobile, render it inside a fullscreen overlay (`fixed inset-0 z-[55]`) that extends edge-to-edge, with the safe-area zone painted the same color as the timer bar (`bg-background/95` with backdrop blur). This eliminates any visible gap above the notch.

### Changes

**File: `src/pages/Training.tsx`** (lines 151-158)

Wrap the mobile workout logger in a fullscreen overlay that covers the header:

```tsx
if (showLogger && selectedWorkout) {
  return (
    <AppLayout>
      {/* Mobile: fullscreen overlay covers header, sits above z-50 nav */}
      <div className="fixed inset-0 z-[55] bg-background overflow-y-auto safe-top pb-24 px-4 md:hidden">
        <WorkoutLogger ... />
      </div>
      {/* Desktop: render normally inside main */}
      <div className="animate-fade-in hidden md:block">
        <WorkoutLogger ... />
      </div>
    </AppLayout>
  );
}
```

Key details:
- `fixed inset-0 z-[55]` — covers the header (z-50) completely
- `safe-top` — uses `padding-top: env(safe-area-inset-top)` so the timer bar sits just below the Dynamic Island, with opaque `bg-background` filling the notch zone seamlessly
- `pb-24` — leaves room for the bottom nav bar which remains visible
- `md:hidden` / `hidden md:block` — desktop rendering stays exactly the same inside `<main>`
- `overflow-y-auto` — exercise list remains scrollable

**File: `src/components/WorkoutLogger.tsx`** (line 886)

Adjust the sticky header's negative top margin so it works correctly inside the overlay (the overlay already handles safe-area padding, so the header just needs `top-0`):

The existing `-mt-6` pulls the header flush — inside the overlay container this still works since we keep `px-4` on the parent. No structural changes needed to WorkoutLogger itself.

### What This Fixes
- The notch/Dynamic Island zone is painted solid `bg-background` (#0a0a0a) — no gap, no bleed-through of the hamburger/settings icons
- Bottom nav (Home, Calendar, Nutrition, Messages) stays fully visible and functional
- Desktop layout is completely unchanged

