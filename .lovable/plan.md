

## Bug Analysis and Fix Plan

### Bug 1: Quantity Display Discrepancy (1218g vs 40g)

**Root Cause**: In `handleDetailConfirm` (AddFoodScreen.tsx line 866-884), three fields are stored incorrectly when logging via the FoodDetailScreen in grams mode:

1. **`quantity_display`** (line 879): Uses `customGrams * entry.quantity`. This is fragile — if `customGrams` or `quantity` get stale due to the async serving memory effect in FoodDetailScreen overwriting user input, the stored value diverges from what the user intended. The entry already has `totalGrams` which is the canonical computed value.

2. **`servings`** (line 871): Stores `entry.quantity` (the "Number of Servings" field, typically 1). But `servings` in `nutrition_logs` is used by `EditFoodModal` as a multiplier against `food_items.serving_size` to reconstruct gram amounts. When `servings=1` but the user logged 40g of a food with 30.45g serving_size, the Edit modal computes wrong values.

3. **`extractMicros`** (line 859): Passes `entry.quantity` (number of servings) instead of the actual multiplier, producing wrong micronutrient values.

**Additionally**: The FoodDetailScreen serving memory `useEffect` can overwrite `customGramsStr` after the user has already typed a value (race condition with async Supabase fetch).

**Fix** (2 files):

**`src/components/nutrition/FoodDetailScreen.tsx`**:
- Add a `userInteracted` ref that flips to `true` on any input change
- Guard the serving memory callback: skip state updates if `userInteracted.current === true`
- This prevents the async memory fetch from clobbering user input

**`src/components/nutrition/AddFoodScreen.tsx`** (`handleDetailConfirm`):
- Change `quantity_display` to use `entry.totalGrams` (already correctly computed as `effectiveGrams`)
- Change `servings` to compute the actual multiplier: `entry.totalGrams / (detailFood?.serving_size || 100)` for grams mode, `entry.quantity` for serving mode
- Fix `extractMicros` to use the same computed multiplier instead of `entry.quantity`

---

### Bug 2: FoodDetailScreen UI pushed off-screen by iOS keyboard

**Root Cause**: The FoodDetailScreen uses `fixed inset-0` positioning. On iOS (PWA/Capacitor), when the software keyboard opens, the viewport shrinks and the browser scrolls to keep the focused input visible, pushing the header (with the "Log" button) above the visible area. Even after dismissing the keyboard or switching tabs, the layout can remain offset.

**Fix** (`src/components/nutrition/FoodDetailScreen.tsx`):
- Add a sticky duplicate "Log" button at the bottom of the scrollable content area (inside `pb