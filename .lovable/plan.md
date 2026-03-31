

## Plan: Fix iOS Overlay Layout Stability for Nutrition Screens

### Problem
When opening "Add Food" or navigating sub-screens in the nutrition tracker on iOS, the full-screen overlays shift downward, creating a gray gap at the top. When dismissing, the bottom nav (Home, Calendar, Training, Nutrition, Messages) and top header (Physique Crafters, settings, hamburger) also shift or disappear. This is caused by inconsistent safe-area handling and missing `100dvh` height constraints on the fixed overlays, plus iOS virtual viewport shifts from keyboard/focus events.

### Root Cause
1. Several full-screen overlay screens use `fixed inset-0` but are **missing safe-area padding** (`paddingTop/paddingBottom` for `env(safe-area-inset-*)`), so iOS pushes content around the notch/home indicator.
2. Some overlays lack `height: 100dvh` and `overscroll-behavior-y: contain`, so iOS Safari's rubber-band scrolling can shift the entire viewport.
3. When overlays close, the viewport offset sometimes doesn't reset, leaving the AppLayout header and bottom nav displaced.

### Fix — Consistent Overlay Container Pattern

Apply the same bulletproof container style to ALL full-screen nutrition overlays:

```css
position: fixed; inset: 0; z-index: 60+;
height: 100dvh;
padding-top: env(safe-area-inset-top, 0px);
padding-bottom: env(safe-area-inset-bottom, 0px);
overscroll-behavior-y: contain;
```

### Files to Edit

| File | Current Issue | Fix |
|---|---|---|
| `src/components/nutrition/AddFoodScreen.tsx` (line 1072) | Has safe-area padding but missing `height: 100dvh` and `overscroll-behavior-y: contain` | Add both missing style properties |
| `src/components/nutrition/FoodDetailScreen.tsx` (line 181) | Already has all three — no change needed | Verify only |
| `src/components/nutrition/SavedMealDetail.tsx` (lines 484, 548) | Missing ALL safe-area padding on both render paths | Add full safe-area style to both `fixed inset-0` containers |
| `src/components/nutrition/CreateMealSheet.tsx` (lines 466, 675) | Missing ALL safe-area padding on both render paths | Add full safe-area style to both containers |
| `src/components/nutrition/CopyPreviousMealSheet.tsx` (line 170) | Missing ALL safe-area padding | Add full safe-area style |
| `src/components/nutrition/PCRecipeDetail.tsx` (line 109) | Missing ALL safe-area padding | Add full safe-area style |

Additionally, ensure the **AppLayout** header and bottom nav are resilient:

| File | Fix |
|---|---|
| `src/components/AppLayout.tsx` | Add `overscroll-behavior: none` to the root container div (line 196) to prevent iOS rubber-band scrolling from displacing the layout. Add `will-change: transform` or `transform: translateZ(0)` to the bottom nav to force GPU compositing and prevent it from being pushed off-screen by overlay transitions. |

### Technical Details

- The inline `style` prop with `paddingTop: 'env(safe-area-inset-top, 0px)'` is the established pattern from `FoodDetailScreen.tsx` — reuse it across all overlays.
- `100dvh` (dynamic viewport height) is critical on iOS Safari because `100vh` includes the URL bar height, which causes the gray gap.
- `overscroll-behavior-y: contain` prevents scroll chaining from the overlay into the parent document, which triggers iOS viewport shifts.
- The bottom nav already uses `fixed bottom-0 z-50` — overlays at `z-[60]` correctly stack above it, but the nav needs compositing hints to survive overlay mount/unmount transitions.

### No database changes required.

