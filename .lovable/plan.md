

# Sticky Macro Target Sidebar in Meal Plan Builder

## Problem
When building a meal plan (either as a template in Master Libraries or for a specific client), coaches have no way to set calorie/macro targets and see progress toward those targets as they add foods. They have to switch to a different tab to check. Elite Trainer solves this with a sticky sidebar showing "Plan Macros" with target, percentage, and remaining values.

## Approach

### New Component: `MealPlanMacroSidebar.tsx`
A sticky sidebar component that displays:
- **Target Macros** — editable inline fields for calories, protein, carbs, fat
- **Macro %** — auto-calculated from targets (P×4 / C×4 / F×9)
- **Remaining** — target minus current plan totals, color-coded (green when close, red when over)
- **Visual progress bars** for each macro
- Uses `position: sticky; top: 1rem` so it stays visible while scrolling

The targets are local state within the builder (not saved to `nutrition_targets` table, which is per-client daily tracking). For client meal plans, it can optionally load the client's existing `nutrition_targets` as defaults.

### Layout Change in `MealPlanBuilder.tsx`
Wrap the existing content in a two-column flex layout:
- **Left column (sticky sidebar, ~280px)**: `MealPlanMacroSidebar`
- **Right column (flex-1)**: existing builder content

The sidebar receives `days` and computes totals from the currently expanded day (or all days average). On mobile (<768px), the sidebar collapses to a compact sticky top bar instead.

### Props flow
```text
MealPlanBuilder
├── state: targetCalories, targetProtein, targetCarbs, targetFat
├── computed: dayTotals from getDayTotals(expandedDay)
└── <MealPlanMacroSidebar
      targets={{ calories, protein, carbs, fat }}
      current={dayTotals}
      onTargetsChange={setTargets}
    />
```

### Where it appears
- Master Libraries → Meals → New/Edit template (via `MealPlanBuilder forceTemplate`)
- Client → Nutrition → Meal Plan → Edit/Create (via `MealPlanBuilder clientId`)

### Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/MealPlanMacroSidebar.tsx` | **New** — sticky sidebar with editable targets, progress bars, remaining macros |
| `src/components/nutrition/MealPlanBuilder.tsx` | Wrap in 2-column layout, add target state, pass to sidebar, load client targets as defaults |

### Improvements included
- Color-coded remaining values (green = on track, amber = close, red = over)
- Auto-load client's existing nutrition targets when editing a client plan
- Responsive: on mobile, sidebar becomes a compact sticky header strip
- "Set Targets" button opens inline editing mode (no modal needed — faster workflow)

