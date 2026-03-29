

# Nutrition Tracker: Always-Visible Macro Remaining

## The Problem
When clients scroll down to log Dinner or Snacks, they lose sight of their macro targets at the top. They have to scroll all the way back up to check how much protein/carbs/fat/calories they have remaining before deciding what to log. This creates friction and slows down the logging experience.

## Recommended Approach: Compact Floating Remaining Bar

After reviewing both options and how MacroFactor and MyFitnessPal handle this, the best solution is a **compact sticky bottom bar** that shows remaining macros as text. Here is why:

- **Non-sticky rings** (MFP style) would mean the client loses ALL macro visibility once they scroll past the top -- worse than current state when they are mid-list near Lunch/Dinner
- A **bottom summary section** (below Snacks) only helps when fully scrolled down, not while browsing mid-list
- A **slim floating bar** gives instant visibility at ALL scroll positions without eating screen real estate -- this is what MacroFactor's "remaining" banner does

The bar will be a thin, translucent strip pinned above the bottom nav showing:
```text
┌─────────────────────────────────────────────────┐
│  1,041 cal    228P    532C    80F   remaining    │
└─────────────────────────────────────────────────┘
```

It will only appear when the top macro rings scroll out of view (using IntersectionObserver), so it does not double-up information when the rings are visible.

## Technical Plan

### File: `src/components/nutrition/DailyNutritionLog.tsx`

1. Add a `ref` to the macro rings card (line 507) and use `IntersectionObserver` to track when it scrolls out of view
2. When rings are not visible, render a fixed bottom bar showing remaining values:
   - `remaining.calories = targets.calories - totals.calories`
   - Same for protein, carbs, fat
   - Color-code: gold for calories, red for protein, blue for carbs, yellow for fat (matching existing ring colors)
   - Negative values shown in red with a minus sign
3. Position the bar at `bottom: 4.5rem` (above the bottom nav) with `z-[50]`, using `bg-card/95 backdrop-blur-sm` for the premium dark glass look
4. Bar is hidden during edit mode (the sticky action bar takes that space)

### Additional Improvement: Bottom Totals Section

Also add a static "Daily Totals" card below the Snacks section (after line 672) showing remaining macros as a clean summary -- this gives a natural endpoint when scrolling and reinforces the floating bar data.

### No new files or database changes required.

