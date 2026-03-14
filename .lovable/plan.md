

# Fix Hidden "Add to" Buttons on PC Recipe & Saved Meal Detail Screens

## Problem
Both `PCRecipeDetail` and `SavedMealDetail` use `fixed bottom-0` for the action button, but on iPhone the button gets hidden behind the browser's bottom toolbar and the app's bottom navigation bar. The `pb-24` on the scroll area isn't enough, and `env(safe-area-inset-bottom)` isn't accounted for.

## Fix

### Both files: `PCRecipeDetail.tsx` and `SavedMealDetail.tsx`

1. **Button container**: Change from `fixed bottom-0 p-4` to include safe-area padding for iOS notch/toolbar:
   ```
   fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]
   ```

2. **Scroll area padding**: Increase `pb-24` to `pb-32` to ensure content doesn't get hidden under the taller fixed button area.

3. **Button z-index**: Add `z-[60]` to ensure it renders above the app's bottom nav bar (which is z-50).

### Files changed
| File | Change |
|------|--------|
| `src/components/nutrition/PCRecipeDetail.tsx` | Safe-area bottom padding, increased scroll padding, z-index |
| `src/components/nutrition/SavedMealDetail.tsx` | Same fixes |

No functional changes to the add/log logic — only layout/visibility improvements.

