

# Fix Supplement Delete + Micros Auto-Update

## Issue 1: No way to delete a supplement

**Root cause:** `SupplementLogger.tsx` has no delete functionality. The `SupplementCard` component only has log/adjust controls — no delete button or confirmation.

**Fix in `src/components/nutrition/SupplementLogger.tsx`:**
- Add a `deleteSupplement` function that soft-deletes by setting `is_active = false` (preserves history)
- Add an `AlertDialog` confirmation: "Delete {name}? This will remove it from your list. Logged history is preserved."
- Pass `onDelete` callback to `SupplementCard`
- Add a Trash icon button in the expanded card area (visible when card is expanded, so it's not accidentally tapped)

## Issue 2: Micros tab doesn't update when supplement servings change

**Root cause:** `MicronutrientDashboard` loads data in a `useEffect` that depends on `[targetId, today]`. When servings are changed on the Supps tab, the Micros tab has no way to know it should re-fetch. The Supps and Micros tabs are siblings rendered by `Nutrition.tsx`, with no shared refresh signal.

**Fix:**
1. **`src/components/nutrition/SupplementLogger.tsx`**: After any supplement log change (`logSupplement`, `updateLogServings`, delete), dispatch a custom event `window.dispatchEvent(new Event("supplement-logs-updated"))` — this follows the existing pattern used by `nutrition-logs-updated`.
2. **`src/components/nutrition/MicronutrientDashboard.tsx`**: Add an event listener for `"supplement-logs-updated"` that triggers a re-fetch (increment a refresh counter in the useEffect deps).

This approach requires no changes to `Nutrition.tsx` and follows the project's established custom event pattern for cross-tab synchronization.

## Files to Edit

1. **`src/components/nutrition/SupplementLogger.tsx`** — Add delete with AlertDialog confirmation + dispatch custom event on all mutations
2. **`src/components/nutrition/MicronutrientDashboard.tsx`** — Listen for `"supplement-logs-updated"` event to trigger re-fetch

