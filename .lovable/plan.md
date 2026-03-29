

# Month-to-Month Client Status for Client Tracker

## What We're Building

Add a "commitment status" to the tracker so clients are either **Committed** (countdown with urgency colors) or **Month-to-Month** (no countdown, distinct badge). Coaches toggle this manually. The Command Center gets a separate "Month-to-Month Clients" section.

## Database Change

**Migration**: Add one column to `client_program_tracker`:

```sql
ALTER TABLE public.client_program_tracker
  ADD COLUMN IF NOT EXISTS is_month_to_month boolean NOT NULL DEFAULT false;
```

No other schema changes needed. The existing `weeks`, `start_date`, `end_date` columns remain — they just become irrelevant for display when `is_month_to_month = true`.

## Client Tracker Page (`ClientTracker.tsx`)

1. **Add "M2M" toggle button** on each row — a small icon button (e.g., `Repeat` icon from Lucide) that sets `is_month_to_month = true` and updates the DB. Clicking again reverts to committed.

2. **Display logic**:
   - `is_month_to_month = true` → "Days Left" column shows a **blue/purple badge**: `"M2M Active"` instead of a countdown. No urgency color.
   - `is_month_to_month = false` → current behavior (green/yellow/orange/red countdown).

3. **Sorting**: M2M clients sort to the bottom of the table (after all committed clients sorted by days left). This keeps urgent renewals at top.

4. **Edit dialog**: Add a checkbox/switch "Month-to-Month" so it can also be toggled during edit.

5. **Add dialog**: Add optional "Month-to-Month" toggle when adding a client manually (for clients who start on M2M from day one, e.g., transfer clients).

6. **Renew dialog**: After renewing, optionally offer "Convert to Month-to-Month" toggle — useful when a committed client finishes their term and you're extending them to M2M in one action.

## Command Center (`CoachCommandCenter.tsx`)

1. **New data field**: Fetch `is_month_to_month` from `client_program_tracker`.

2. **Existing "Program Renewals" section**: Filter to only `is_month_to_month = false AND daysLeft <= 30`. No change to urgency colors (red/orange/yellow).

3. **New "Month-to-Month Clients" section**: Separate card below renewals showing all M2M clients as a simple list — name, tier, start date, and a "Message" button. Uses a distinct blue/purple accent. No urgency — these are retained clients.

## Files to Modify

| File | Change |
|---|---|
| **Migration SQL** | Add `is_month_to_month` boolean column |
| `src/pages/ClientTracker.tsx` | M2M badge, toggle button, sorting, edit/add/renew dialog updates |
| `src/components/dashboard/CoachCommandCenter.tsx` | Split renewals query, add M2M section |

## UI Behavior Summary

```text
┌─────────────────────────────────────────────────────────┐
│ CLIENT TRACKER TABLE                                     │
├──────────┬──────┬──────┬──────┬────────────┬────────────┤
│ Client   │ Tier │ Weeks│ Start│ Days Left  │ Actions    │
├──────────┼──────┼──────┼──────┼────────────┼────────────┤
│ John     │ 6-Mo │ 26   │ Jan 1│ 🔴 5d left │ ↻ ✏️ 🗑️ 🔄│
│ Sarah    │ 1-Yr │ 52   │ Mar 1│ 🟡 28d left│ ↻ ✏️ 🗑️ 🔄│
│ Mike     │ Mo.  │ 4    │ Feb 1│ 🟢 45d left│ ↻ ✏️ 🗑️ 🔄│
│ ───────  │ ──── │ ──── │ ──── │ ────────── │ ────────── │
│ Chris G. │ 6-Mo │ 16   │ Mar 9│ 🔵 M2M     │ ↻ ✏️ 🗑️ 🔄│
│ Alex     │ 1-Yr │ 52   │ Jan 5│ 🔵 M2M     │ ↻ ✏️ 🗑️ 🔄│
└──────────┴──────┴──────┴──────┴────────────┴────────────┘
                                  🔄 = M2M toggle
```

```text
┌─ COMMAND CENTER ─────────────────────────┐
│                                           │
│ 🔔 Program Renewals (3)                  │
│ ┌─ John ── 5d left ── 🔴 ── [Message] ┐ │
│ ├─ Sarah ─ 28d left ─ 🟡 ── [Message] ┤ │
│ └─ Mike ── 14d left ─ 🟠 ── [Message] ┘ │
│                                           │
│ 🔄 Month-to-Month Clients (2)           │
│ ┌─ Chris G. ── 6-Month ── [Message] ──┐ │
│ └─ Alex ────── 1-Year ─── [Message] ──┘ │
└───────────────────────────────────────────┘
```

