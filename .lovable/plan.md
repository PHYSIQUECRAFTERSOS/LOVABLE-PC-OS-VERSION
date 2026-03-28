

# Plan: Fix Supplement Plan — Coach Editing, RLS Fix, Emoji Update

## Summary

Four changes: (1) Remove the non-functional "Log" button when a coach views a client's supplement plan (RLS blocks coach inserts to `supplement_logs`), (2) change the fasted/morning ritual emoji from 🌅 to ☀️, (3) add inline editing capabilities for coaches directly in the client's Supps tab, (4) add an "Import from Library" flow.

---

## Change 1: Remove Log Button for Coaches

The `supplement_logs` RLS policy only allows `client_id = auth.uid()`. When a coach views a client's supps tab, `client_id` is the client's ID but `auth.uid()` is the coach — so the insert fails.

**Fix:** In `ClientSupplementPlan.tsx`, detect if the viewer is the coach (when `clientId` prop is provided) and hide the Log button entirely. Coaches don't need to log supplements for clients.

---

## Change 2: Emoji Update

In `ClientSupplementPlan.tsx`, change `TIMING_ICONS.fasted` from `🌅` to `☀️` (the standard iOS sun emoji used in text messages).

---

## Change 3: Inline Coach Editing in Client Supps Tab

When a coach views the client's supplement plan (`clientId` prop is provided), add editing capabilities:

- **Edit dosage**: Each supplement card gets an "Edit" button that opens an inline form to change dosage, timing, and coach note (saves to `client_supplement_overrides` table with upsert)
- **Delete item**: Each card gets a "Remove" button that sets `is_removed = true` in `client_supplement_overrides`
- **Add supplement**: A header "Add Supplement" button opens a dialog where the coach can pick from `master_supplements`, set dosage/timing/note, and insert directly into `supplement_plan_items` for this client's assigned plan
- **Undo remove**: Show a subtle "Removed items" section at the bottom with "Restore" option

All changes use the existing `client_supplement_overrides` table for per-client modifications (dosage, timing, notes, removal), preserving the master plan template.

---

## Change 4: Import from Master Libraries

Add a "Import from Library" button in the coach view header that:
1. Opens a dialog showing all supplements from `master_supplements` (coach's catalog)
2. Coach picks one or more, sets timing slot and dosage
3. Inserts them as new `supplement_plan_items` on the client's active plan
4. Also add a quick "Open Libraries" link that navigates to `/libraries` with the supplements tab active

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/nutrition/ClientSupplementPlan.tsx` | All 4 changes — hide log for coach, emoji fix, add edit/delete/add UI, import dialog |

## No Database Changes Needed

The existing `client_supplement_overrides` table already supports dosage overrides, timing overrides, coach note overrides, and `is_removed`. The `supplement_plan_items` table supports direct inserts for adding new items. All RLS policies are in place.

---

## Recommendations

1. **Bulk import**: When importing, allow multi-select from the master catalog to add several supplements at once
2. **Reorder items**: Add drag-to-reorder within timing groups so the coach can control display order
3. **Plan swap shortcut**: Add a "Switch Plan" button so the coach can quickly reassign a different plan template without going to Master Libraries
4. **Compliance view**: Show the coach which supplements the client has logged today (read-only) alongside the edit controls, so they can monitor adherence while editing

