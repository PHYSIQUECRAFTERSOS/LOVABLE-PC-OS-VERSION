## Goal

Add a "Scan Label" option inside the Create Meal → Barcode tab that mirrors the Nutrition Tracker's Scan Label flow, relabel the camera button so users know the fallback exists, and fix the "can't save meal" issue Manny reported.

## Changes

### 1. `src/components/nutrition/CreateMealSheet.tsx` (Barcode tab UI)

- Rename the existing button from `Start Camera Scanner` to a two-line label:
  - Line 1 (bold): `Start Camera Scanner`
  - Line 2 (smaller, muted): `If not working, use Scan Label below and take a picture of the label`
- Add a new full-width `Scan Label` button directly beneath it, styled to match (same height, gold outline, `Camera` icon).
- On tap, open the same Scan Label picker used in the tracker (Take Photo / Choose from Library → AI extraction → confirm sheet).
- When the user confirms the extracted label, instead of writing to `nutrition_logs`, push the scanned food into the meal's `items` array via the existing `mapFoodToStaged()` helper — so it becomes an ingredient of the meal being built (name, brand, calories, protein, carbs, fat, serving size, serving unit).
- Keep the manual barcode input row unchanged.

### 2. `src/components/nutrition/ScanFoodLabelButton.tsx` (make it reusable)

- Add a new optional prop `onExtracted?: (result: ScanResult) => void`.
- When `onExtracted` is provided, after the user confirms the parsed values the component invokes `onExtracted(result)` and closes — it skips the `nutrition_logs` insert entirely.
- When `onExtracted` is not provided, existing behavior (log to nutrition_logs) is preserved — no regression for the tracker.
- Add a new `variant: "meal-button"` styled to fit inside the Create Meal barcode tab (full width, matte-black + gold outline, matches the Start Camera Scanner button).

### 3. Fix "can't save meal" bug

Root cause suspects to verify and patch:

- `saved_meal_items` inserts use `serving_unit: item.serving_unit === "g" ? "g" : item.serving_label`. If a barcode/scan result returns `serving_label = null` (common for FatSecret 100g entries and for AI-scanned labels where only unit is known), this writes `null` into a NOT NULL column and the insert fails silently to the user (they only see "Couldn't save meal items"). Fix: fall back to `item.serving_unit || "g"` so a valid string is always written.
- Verify `mapFoodToStaged()` always populates `serving_size_g`, `calories_per_100g`, etc. for barcode + scan-label results. Add a safety normalizer so any missing per-100g field is derived from the absolute macros / serving grams before staging (prevents NaN → insert rejection).
- Add a specific error toast that surfaces the DB error message (already partially there) and log the offending row shape to console for future debugging.

### 4. Mobile layout polish

- Ensure both buttons are 48px tall, full width, 12px vertical spacing, single column on mobile (matches Trainerize/current design system).
- Confirm the confirm sheet opened from Scan Label uses the existing `OverlayPortal` at `z-[70]` so it sits above the Create Meal overlay (`z-[55]`).

## Out of scope

- No changes to the daily nutrition tracker's Scan Label behavior.
- No changes to barcode camera/zxing logic itself.
- No schema changes.

## Clarifying question

When a user scans a label from inside Create Meal, should the extracted food also be saved into their Custom Foods library (so it's reusable later), or should it stay ephemeral to just this meal? Default in the plan above is ephemeral — let me know if you want it saved as a custom food too. yes it should be saved to their custom food

&nbsp;