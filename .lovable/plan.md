

# Fix Serving Memory for Grams Mode

## Problem
The "Smart Serving Memory" feature exists but has a data mismatch bug for grams-mode logging.

**What's saved** (AddFoodScreen.tsx line 904-908):
- `serving_size: entry.quantity` → saves `1` (the number of servings)
- `serving_unit: entry.servingDescription` → saves `"130g"` (the label string)

**What's read** (FoodDetailScreen.tsx line 110):
- Checks `serving_unit === "g"` → `"130g" !== "g"` → **fails**
- Falls to else → tries to match `"130g"` as a serving option → **fails**
- Falls to grams fallback with `serving_size` = `1` → shows `1g` instead of `130g`

## Fix

### File: `src/components/nutrition/AddFoodScreen.tsx` (save path)

In the `handleDetailConfirm` upsert (line 904-911), detect grams mode from the entry and save properly:

```tsx
// Before (broken):
serving_size: entry.quantity,           // 1
serving_unit: entry.servingDescription, // "130g"

// After (fixed):
serving_size: (entry as any).useGrams ? (entry as any).customGrams : entry.quantity,
serving_unit: (entry as any).useGrams ? "g" : entry.servingDescription,
```

The `FoodDetailEntry` from `handleConfirm` already includes `useGrams` and `customGrams` (cast via `as any` on line 173 of FoodDetailScreen). We just need to use them when persisting the memory.

### No changes needed to the read path
The read logic in FoodDetailScreen.tsx (lines 110-125) already handles `serving_unit === "g"` correctly — it sets `useGrams(true)` and `customGramsStr` to the stored size. The bug is purely in what gets saved.

## Additional Suggestion: Pre-fill grams mode toggle

Currently, when a user opens a food for the first time, `useGrams` defaults to `false` (serving mode). If the memory says grams, the useEffect flips it — but there's a brief flicker. This is already handled by the existing useEffect and is fine.

## Suggestions to Further Speed Up Nutrition Logging

1. **"Last Logged" badge on search results** — Show "130g" chip next to salmon in search results so users can one-tap log without even opening the detail screen
2. **Quick re-log from history** — The history tab already exists, but adding a "Log Again" button (same quantity/unit as last time) would save 2 taps
3. **Batch quick-add** — Let users tap multiple foods from search results to stage them, then confirm all at once instead of one-by-one

