

# Client Program Tracker — Replacing the PC Auto Client Tracker

## Overview

Build a new "Client Tracker" section in the coach-side navigation that replaces the Excel spreadsheet. Each coach sees only their own clients. Data auto-populates when a new client is invited (start date + weeks from tier). Coaches can manually edit all fields. Clients approaching program end (30/14/7 days) surface on the Command Center with color-coded urgency.

## Database Changes

### New table: `client_program_tracker`

```text
id              uuid PK default gen_random_uuid()
coach_id        uuid NOT NULL (references auth.users)
client_id       uuid NOT NULL (references auth.users)
client_name     text NOT NULL
weeks           integer NOT NULL
start_date      date NOT NULL
end_date        date GENERATED ALWAYS AS (start_date + (weeks * 7) * interval '1 day')
revenue         text (free-text, e.g. "$2399 USD 6 month PIF")
notes           text
tier_name       text
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
UNIQUE(coach_id, client_id)
```

`days_left` will be computed in the UI as `differenceInDays(end_date, today)` — no stored column needed since it changes daily.

### RLS Policies
- SELECT/INSERT/UPDATE/DELETE: `coach_id = auth.uid()` OR `has_role(auth.uid(), 'admin')`
- Admin can see all rows (for Command Center aggregation across coaches)

### Tier-to-weeks mapping
Add a `default_weeks` integer column to `client_tiers` table so each tier auto-populates weeks:
- 1 Year = 52
- 6 Month = 26
- Monthly = 4
- 6 Week = 6
- etc.

### Auto-populate on invite acceptance
Update the `send-client-invite` edge function (or add a database trigger on `coach_clients` INSERT) to automatically create a `client_program_tracker` row when a client is assigned, pulling `tier_name` and `default_weeks` from the invite/tier.

### Auto-remove on deactivate/delete
Add a trigger or update the `manage-client-status` edge function: when a client is deactivated or deleted, delete their `client_program_tracker` row.

## New UI Components

### 1. Client Tracker Page (`src/pages/ClientTracker.tsx`)
- Route: `/client-tracker` (coach/admin only)
- Nav: Add to `coachNav` in AppLayout between "Clients" and "Team"
- Table view with columns: Client Name, Tier, Weeks, Start Date, End Date, Days Left, Revenue, Notes
- Color-coded "Days Left" badges:
  - Green: > 30 days
  - Yellow (#F59E0B): 15-30 days
  - Orange (#F97316): 8-14 days
  - Red (#EF4444): 0-7 days
  - Gray (strikethrough): negative (expired)
- Inline editing: click any cell to edit (weeks, notes, revenue, start date)
- "Add Entry" button for manually adding a tracker row (with client select dropdown)
- Sort by days left (ascending) by default
- Search/filter by client name

### 2. Command Center Integration
Add a new "Program Renewals" section to `CoachCommandCenter.tsx`:
- Query `client_program_tracker` for the coach's clients where `days_left <= 30`
- Show as cards sorted by urgency (fewest days first)
- Color bands: Yellow (30d), Orange (14d), Red (7d)
- Each card shows: client name, days left, tier, end date
- "Message" button to open QuickMessageDialog with a prefilled renewal prompt
- Admin view shows all coaches' clients approaching renewal

### 3. Auto-populate on Add Client
Update `AddClientWithAssignmentDialog.tsx`:
- After successful invite, insert a `client_program_tracker` row using the selected tier's `default_weeks`, today as `start_date`, the tier name, and the assigned coach

### 4. Renewal Flow
On the tracker page, a "Renew" button per client:
- Opens a small modal: "Add weeks" input (pre-filled from tier)
- On confirm: updates `end_date` by adding new weeks to current `end_date` (extend behavior)
- Optionally update notes (e.g., "Renewed 26 weeks on March 29")

## Files to Create/Modify

1. **Migration SQL** — create `client_program_tracker` table + RLS + add `default_weeks` to `client_tiers`
2. **`src/pages/ClientTracker.tsx`** — new page with table UI
3. **`src/App.tsx`** — add route `/client-tracker`
4. **`src/components/AppLayout.tsx`** — add nav item for coaches
5. **`src/components/clients/AddClientWithAssignmentDialog.tsx`** — auto-insert tracker row on invite
6. **`src/components/dashboard/CoachCommandCenter.tsx`** — add "Program Renewals" section
7. **`supabase/functions/manage-client-status/index.ts`** — delete tracker row on client deactivation/deletion

## Technical Notes

- End date is computed as `start_date + (weeks * 7) days` — using a generated column in Postgres avoids manual sync
- Days left is computed client-side for real-time accuracy
- The tracker is coach-scoped via RLS: Aaron only sees his clients, Kevin sees his own (and as admin, can see all)
- Revenue field is free-text to accommodate varied payment structures (PIF, monthly, Klarna, CAD/USD, promos)
- Existing active clients will need a one-time manual data entry (or a bulk import tool)

