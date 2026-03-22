

# Fix Nutrition Tracker Edit Mode Delete + Saved Meal Delete Freeze

## Problem 1: Edit Mode Needs "Delete Selected" Button
Currently, when the user taps "Edit" in the nutrition tracker, they can select items but the only action is "Save as Meal". There is no way to bulk-delete selected items. The user wants a MyFitnessPal-style "Delete" button that appears when items are selected.

## Problem 2: Saved Meal Trash Icon Freezes Screen
When the user taps the trash icon in `SavedMealDetail`, the `AlertDialog` opens via a Radix portal — but the parent component is a `fixed inset-0 z-50` full-screen overlay. The AlertDialog's portal renders at a lower or competing z-index, making it visually hidden or unresponsive behind the parent. The screen appears frozen because the AlertDialog overlay blocks touch events but the confirmation buttons are invisible/unreachable.

## Plan

### Fix 1: Add "Delete Selected" to Edit Mode Sticky Bar
**File:** `src/components/nutrition/DailyNutritionLog.tsx`

- Add a `deletingSelected` state and a `deleteConfirmOpen` state
- When items are selected in edit mode, show **two buttons** in the sticky bar instead of just "Save as Meal":
  1. **Delete (N)** — red/destructive button that opens an AlertDialog confirmation: "Are you sure you want to delete N items?" with "Delete Now" and "Cancel"
  2. **Save as Meal (N)** — existing behavior
- On "Delete Now": loop through `selectedIds`, call `deleteLog` for each, then clear selection and exit edit mode
- Import `AlertDialog` components (already imported in other files)

### Fix 2: Fix SavedMealDetail Delete Dialog Z-Index
**File:** `src/components/nutrition/SavedMealDetail.tsx`

- The root issue is the AlertDialog portal competing with the `fixed inset-0 z-50` parent
- Fix by adding explicit z-index classes to the AlertDialog content: `className="z-[70]"` on `AlertDialogContent` to ensure it renders above the parent overlay
- Also update button labels to match the requested copy: "Delete Now" and "Cancel"
- Add "Are you sure you want to delete" to the description text

### Improvements

1. **Select All / Deselect All**: Add a "Select All" toggle at the top of the edit mode view so users can quickly select everything in a meal section without tapping each item individually
2. **Visual feedback during bulk delete**: Show a brief loading state on the "Delete Now" button while items are being removed
3. **Haptic feedback**: Trigger a subtle vibration on item selection toggle for tactile response on mobile

## Files Changed

| File | Change |
|---|---|
| `src/components/nutrition/DailyNutritionLog.tsx` | Add bulk delete button with AlertDialog confirmation in edit mode sticky bar, add "Select All" toggle |
| `src/components/nutrition/SavedMealDetail.tsx` | Fix AlertDialog z-index to prevent freeze, update button labels |

