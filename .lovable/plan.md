
## Client Bug Fixes — Three Issues

### Bug 1: Can't input decimal points in weight (Workout Logger)
**Root cause**: `inputMode="numeric"` on the weight input field in `ExerciseCard.tsx` (line 419). On iOS, `numeric` shows only digits 0-9 without a decimal point key.
**Fix**: Change `inputMode="numeric"` to `inputMode="decimal"` on the weight input. Also update the onChange handler to allow intermediate decimal states (e.g. "135." while typing "135.5").

**File**: `src/components/workout/ExerciseCard.tsx` (line 419)

### Bug 2: Can't unfavorite a food + Star adds duplicate lines
**Root cause**: Two problems in `handleToggleFavorite` in `AddFoodScreen.tsx`:
1. No guard against rapid clicks — user taps star multiple times before the first request resolves, causing concurrent API calls and UI state corruption
2. After toggling, `fetchFavoriteFoods()` re-fetches the full list which can race with the optimistic state update

**Fix**:
- Add a `togglingRef` Set to track in-flight food IDs and skip duplicate clicks
- Apply optimistic UI update immediately (remove from favorites list if unfavoriting) so the user sees instant feedback
- Keep the `fetchFavoriteFoods()` call as a background sync but guard it against races

**File**: `src/components/nutrition/AddFoodScreen.tsx` (lines 805-837)

### Summary of Changes
| File | Change |
|------|--------|
| `ExerciseCard.tsx` | `inputMode="numeric"` → `inputMode="decimal"` on weight input, allow decimal intermediate states |
| `AddFoodScreen.tsx` | Add toggling guard ref, prevent rapid duplicate clicks, optimistic unfavorite removal |

### Testing
After implementation, navigate to:
1. Training → start a workout → verify weight field shows decimal keyboard on mobile
2. Nutrition → search a food → favorite it → tap star again → verify it unfavorites cleanly without adding duplicate lines
