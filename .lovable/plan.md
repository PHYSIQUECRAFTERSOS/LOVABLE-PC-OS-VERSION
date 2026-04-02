

## Fix: Instant Food Logging with Double-Tap Prevention

### Problem
When pressing "Log" on the Food Detail Screen, there's a 1-2 second delay before the entry appears in the tracker. Users tap again thinking it didn't register, creating duplicates. The delay comes from:
1. `importOFFFood()` — imports external foods into `food_items` (network call)
2. Micronutrient fetch — queries `food_items` for micro data
3. No disabled/loading state on the Log button — allows double-taps

### Solution
Optimistic close + background persistence + double-tap guard.

**File: `src/components/nutrition/FoodDetailScreen.tsx`**
- Add a `logging` state (boolean)
- Set `logging = true` in `handleConfirm`, disable both Log buttons while true
- This prevents double-taps at the source

**File: `src/components/nutrition/AddFoodScreen.tsx`**
Two changes in `handleDetailConfirm`:
1. **Immediately close the detail screen and call `onLogged()`** before doing the Supabase insert — this gives instant UI feedback (the tracker refreshes immediately via the custom event)
2. **Move blocking work to background**: fire `importOFFFood`, micro fetch, and the insert in a fire-and-forget async block. Show error toast only if insert fails.
3. **Add a `loggingRef` guard** to prevent `handleDetailConfirm` from executing twice

Same pattern applied to `logFood` (the inline quick-add path):
1. Add an `isLogging` ref guard to prevent double execution
2. Call `onLogged()` and show toast immediately after the insert succeeds (already done), but ensure the button is disabled during the operation

### Technical Details

**FoodDetailScreen.tsx changes:**
- Add `const [logging, setLogging] = useState(false)`
- In `handleConfirm`: set `setLogging(true)` before calling `onConfirm`
- Both Log buttons get `disabled={logging}` and show "Logging..." text when active

**AddFoodScreen.tsx changes in `handleDetailConfirm`:**
```
// 1. Immediately dismiss detail screen + notify parent
setDetailFood(null);
toast({ title: `${entry.food.name} logged` });
onLogged(); // triggers tracker refresh instantly

// 2. Background persist (no await blocking UI)
(async () => {
  // importOFFFood, fetch micros, insert — all in background
  // Show error toast if insert fails
})();
```

**AddFoodScreen.tsx changes in `logFood`:**
- Add `const loggingRef = useRef(false)` guard
- At start: `if (loggingRef.current) return; loggingRef.current = true;`
- In finally: `loggingRef.current = false;`

### Files to Modify
- `src/components/nutrition/FoodDetailScreen.tsx` — loading state on Log buttons
- `src/components/nutrition/AddFoodScreen.tsx` — optimistic close pattern + double-tap guard on both `handleDetailConfirm` and `logFood`

No database changes needed.

