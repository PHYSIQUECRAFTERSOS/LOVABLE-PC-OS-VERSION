

## Fix: Select dropdowns hidden behind Dialog overlay

### Root Cause
The `SelectContent` component (in `src/components/ui/select.tsx`) renders its dropdown via a Radix Portal at `z-50`. The `DialogContent` and `DialogOverlay` (in `src/components/ui/dialog.tsx`) both render at `z-[70]`. Since the Select portal is a sibling of the Dialog portal in the DOM, the dropdown appears behind the dialog overlay — clicks seem to do nothing, and the tier/staff lists are invisible.

This likely broke when the dialog z-index was elevated to `z-[70]` (probably to fix a different stacking issue with toasts or other overlays).

### Fix
**File: `src/components/ui/select.tsx`** — Increase the `SelectContent` z-index from `z-50` to `z-[80]` so it renders above the dialog.

This is a one-line change on the `SelectContent` className: replace `z-50` with `z-[80]`.

No other files need to change. No database changes. No edge function changes. The email invite flow remains untouched.

### Why this is safe
- Only affects the visual stacking order of Select dropdowns
- `z-[80]` is higher than the dialog's `z-[70]` but won't conflict with anything else (toasts use `z-[100]`)
- This restores the original behavior where Select dropdowns were visible inside dialogs

