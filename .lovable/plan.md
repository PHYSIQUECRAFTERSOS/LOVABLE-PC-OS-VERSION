# Plan: Program Type Tags, Editable Goals, Filters, and Bulk Assignment

## Summary

Six changes across database and UI: (1) Add `program_type` column to `coach_clients`, (2) editable goal selector in preview dialog, (3) program type badge in preview + profile header, (4) program type filter on Clients page, (5) bulk program type assignment for selected clients, and (6) system improvements.

---

## Database Change

Add `program_type` column to `coach_clients`:

```sql
ALTER TABLE coach_clients ADD COLUMN IF NOT EXISTS program_type TEXT DEFAULT NULL;
```

No new table needed. No new RLS policies needed — existing `coach_clients` policies already cover coach read/write.

---

## Change 1: Editable Goal in Preview Dialog

**File:** `src/components/clients/ClientPreviewDialog.tsx`

- Replace the static `data.primaryGoal` text (line 282) with a clickable Popover
- On click, show 4 options: Lose Fat, Build Muscle, Recomposition, Maintenance
- On selection, upsert to `client_goals` table and update local state immediately
- Coach can change the client's goal without leaving the preview

---

## Change 2: Program Type Badge in Preview Dialog + Editable

**File:** `src/components/clients/ClientPreviewDialog.tsx`

- Fetch `program_type` from `coach_clients` in the existing `fetchAll` effect
- Display below the goal as a small badge (e.g., `📋 6 Week Program`)
- Add a clickable Select dropdown to change it from the predefined list:
  - Weekly Progress Updates
  - Bi-Weekly Progress Updates
  - 6 Week Program
  - Training Only Program
  - Training Only With Weekly Progress Updates
  - Nutrition Only With Weekly Progress Updates
  - Other
- Save via `supabase.from("coach_clients").update({ program_type }).eq("client_id", clientId).eq("coach_id", user.id)`

---

## Change 3: Program Type Badge in Client Profile Header

**File:** `src/pages/ClientDetail.tsx`

- Fetch `program_type` from `coach_clients` in the existing `useEffect` load (alongside profile, tags, program)
- Display as a Badge below the client name, next to existing program/tag badges

---

## Change 4: Filter by Program Type on Clients Page

**File:** `src/components/clients/SelectableClientCards.tsx`

- Add state: `programTypeFilter` (default: `"all"`)
- Fetch `program_type` from `coach_clients` alongside `client_id` in the client load query
- Store program type per client in a `programTypeMap: Record<string, string>`
- Add a new Select dropdown in the toolbar (next to existing status/tag filters): "Program Type" with all 6 options + "All"
- Add program type to `filteredClients` filter logic
- Show program type badge on each client card

---

## Change 5: Bulk Program Type Assignment

**File:** `src/components/clients/SelectableClientCards.tsx`

- When clients are selected (`selectedIds.size > 0`), show an additional "Assign Program Type" button next to "Send Message"
- On click, show a dropdown/popover with the 6 program types
- On selection, batch update: `supabase.from("coach_clients").update({ program_type }).in("client_id", [...selectedIds]).eq("coach_id", user.id)`
- Refresh local state to reflect changes immediately
- Show success toast: "Program type updated for X clients"

---

## Files Modified


| File                                               | Change                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Migration SQL                                      | Add `program_type` column to `coach_clients`                            |
| `src/components/clients/ClientPreviewDialog.tsx`   | Editable goal dropdown, program type badge + editor, fetch program_type |
| `src/pages/ClientDetail.tsx`                       | Fetch + display program type badge in header                            |
| `src/components/clients/SelectableClientCards.tsx` | Program type filter, bulk assignment button, show program type on cards |


---

## Improvements Included

1. **Program type visible on client cards** — each card shows a small badge so coaches can see at a glance
2. **Bulk assignment** — select multiple clients, assign program type in one action
3. **Filter by program type** — quickly find all clients on a specific program type
4. **Goal is coach-editable** — coaches can update goals as clients progress through phases without navigating to settings