

## Fix Food Favoriting — Both Client and Coach Sides

### Problems Found

**Coach side (`FoodSearchPanel.tsx`):**
1. **Star button only renders for `source === "local"` foods** (lines 637-651). External foods (USDA, FatSecret, OFF) never show the star — users literally cannot click it.
2. **Favorites tab only filters from recents** (line 378) — if you favorite a food you haven't recently used, it won't appear in the Favorites tab. Need to load actual favorite foods from `coach_favorite_foods`.
3. **No import-before-favorite logic** — when a non-local food is starred, it must be imported into `food_items` first (so `coach_favorite_foods.food_item_id` has a valid FK). Currently this is missing.
4. **No rapid-click guard** — unlike the client side, there's no protection against double-tapping the star.

**Client side (`AddFoodScreen.tsx`):**
5. The existing logic looks correct in structure but has a subtle issue: if `importOFFFood` returns a food but the ID assignment to `localId` happens after a race, the `toggle_food_favorite` RPC may receive the wrong ID. The current guard fixes most cases, but I'll verify the flow is clean.

### Plan

#### Step 1: Fix `FoodSearchPanel.tsx` (Coach Meal Plan Builder)
- **Load favorite foods separately**: Add a `favoriteFoodsList` state. In `loadFavorites`, after fetching IDs from `coach_favorite_foods`, also fetch the full food data from `food_items` so the Favorites tab can display them even if they aren't in recents.
- **Show star for ALL foods**: Remove the `food.source === "local"` guard on lines 637-651. Always render the star button.
- **Import before favorite**: When star is clicked on a non-local food, import it into `food_items` first (same pattern as `handleSelect` already does for OFF foods), then insert into `coach_favorite_foods`.
- **Add rapid-click guard**: Add a `togglingRef` Set like the client side has.
- **Fix Favorites tab display**: Use `favoriteFoodsList` instead of filtering recents.

#### Step 2: Verify `AddFoodScreen.tsx` (Client Side)
- Confirm the existing import-then-favorite flow handles all source types (USDA, FatSecret, OFF).
- The current code already handles this correctly with the `importOFFFood` call.

### Files Modified
| File | Change |
|------|--------|
| `src/components/nutrition/FoodSearchPanel.tsx` | Load favorite foods, show star for all foods, import-before-favorite, rapid-click guard |

### No Database Changes Required
Both `coach_favorite_foods` (coach) and `user_food_history` (client) tables already exist with the correct schema.

### Testing
After implementation:
1. Coach side: Search a food → star it → check Favorites tab → unstar it → confirm removal
2. Coach side: Star an external (USDA/branded) food → confirm it appears in Favorites
3. Client side: Verify existing favorite flow still works (no regressions from logging changes)

