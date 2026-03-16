

# Replace Plan Targets Sidebar with Full Nutrition Goal Interface

## What Changes

Replace the current simple "Plan Targets" sidebar in the Meal Plan Builder (4 plain number inputs for cal/protein/carbs/fat) with the rich "Set Nutrition Goal" interface — the one with the tri-segment macro distribution bar, percentage sliders that auto-balance to 100%, calorie input, and live macro preview. This will be embedded directly in the sticky sidebar (not as a modal).

## How It Works

**Rewrite `MealPlanMacroSidebar.tsx`** to include:

1. **Goal Type Selector** — dropdown: "Calories Only", "Calories + Protein", "Full Macros" (default)
2. **Calorie Input** — number field for daily calories
3. **Macro Distribution Bar** — colored horizontal bar showing protein (blue) / carbs (amber) / fat (rose) percentages
4. **Linked Percentage Sliders** — dragging one slider auto-adjusts the other two to keep total at 100% (same logic from `NutritionGoalModal`)
5. **Live Macro Preview** — shows computed grams and percentages in colored cards
6. **"Remaining" Progress Section** — keeps the existing progress bars showing how the current day's foods compare against targets (the part that shows "45g left" etc.)
7. **Fiber/Sugar quick stats** — retained at the bottom

**Sticky behavior** — the sidebar already uses `sticky top-4`; this will be preserved. On mobile, the compact collapsible bar at the top is retained with a summary view.

**Data flow** — the sliders set percentage state internally, compute grams via `calories × pct / 4|9`, and call `onTargetsChange({ calories, protein, carbs, fat })` on every change so the builder's "Remaining" calculations update in real-time. No separate save button needed — targets flow directly into the builder state.

**Files changed:**
- `src/components/nutrition/MealPlanMacroSidebar.tsx` — full rewrite with the slider-based UI

No database changes needed. The sidebar already receives and emits `MacroTargets` via props.

