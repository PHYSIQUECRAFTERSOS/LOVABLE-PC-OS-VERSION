# Increase meal-plan builder readability

Visual-only change to `src/components/nutrition/MealPlanBuilder.tsx`. No layout restructuring, no functional changes.

## Type-size bumps (within food rows and meal headers)

| Element | Current | New |
|---|---|---|
| Food name (L1203) | `text-xs font-medium` | `text-sm font-semibold` |
| Brand label (L1204) | `text-[10px]` | `text-xs` |
| Quantity input (L1217) | `h-6 w-16 text-[11px]` | `h-7 w-16 text-sm` |
| Unit label (L1219) | `text-[10px] w-10` | `text-xs w-12` |
| Macro pills row (L1221–1225) | `text-[10px]` | `text-xs font-medium` |
| Note/Delete icon buttons (L1230, 1236) | `h-5 w-5` with `h-3 w-3` icons | `h-7 w-7` with `h-4 w-4` icons |
| Food note textarea (L1246) | `text-[11px]` | `text-sm` |
| Meal-header cal/macro summary (L1152) | `text-[10px]` | `text-xs` |
| Meal name input (L1148) | `h-6 w-36 text-xs` | `h-7 w-44 text-sm` |
| Coach note textarea (L1185) | `text-[11px] min-h-[44px]` | `text-sm min-h-[48px]` |
| "Add Food" button (L1262) | `h-7 text-xs` | `h-8 text-sm` with `h-4 w-4` plus icon |
| Row vertical padding (L1199) | `py-2` | `py-2.5` (slightly more breathing room) |

## Out of scope
- No changes to data, queries, save logic, or PDF export.
- No changes to the left "Nutrition Goal" sidebar (already legible).
- No restructuring of the row layout — only sizes and weights.

## Verification
- Open Master Libraries → Meal Plan Builder, expand a Training Day, confirm food names, brand, units, macro pills, and Add Food button are noticeably larger and easier to read.
- Confirm row still fits on desktop without wrapping; on mobile the macro pills already hide via `hidden sm:flex` and continue to do so.
