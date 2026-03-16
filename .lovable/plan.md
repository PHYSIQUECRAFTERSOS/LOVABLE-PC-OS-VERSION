

# Check-In Submission Dashboard for Coach Command Center

## Overview

A new section at the bottom of the Coach Command Center showing weekly check-in submission status across all clients, organized into three groups: submitted Wednesday, submitted Thursday, and not submitted (at-risk). Resets every Monday at midnight PST. Biweekly clients on off-weeks shown separately with their next due date.

## Database Changes

### 1. Add `checkin_dashboard_week_start` view concept (no migration needed)
The dashboard will compute the current week window dynamically in the query (Monday-to-Sunday PST window). No new tables needed — we query `checkin_submissions` and `checkin_assignments` directly.

### 2. Enable realtime on `checkin_submissions`
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkin_submissions;
```

This lets the dashboard update live when clients submit check-ins.

## Data Architecture

The query logic inside `CoachCommandCenter.tsx`:

1. Fetch active `checkin_assignments` for all coach's clients (includes `recurrence`, `next_due_date`, `client_id`)
2. Compute current week window: Monday 00:00 PST to Sunday 23:59 PST
3. Fetch `checkin_submissions` where `client_id` is in coach's clients and `submitted_at` falls within current week
4. Fetch `profiles` for timezone data (already fetched)
5. Categorize:
   - **Biweekly off-week**: `recurrence = 'biweekly'` AND `next_due_date` is after this week's Sunday → show with "Next due: [date]" label
   - **Submitted Wednesday** (Tue/Wed): `submitted_at` day-of-week is Tuesday or Wednesday
   - **Submitted Thursday**: `submitted_at` day-of-week is Thursday
   - **Not Submitted**: active weekly assignment (or biweekly due this week) with no submission this week, checked after Thursday → flagged at-risk

Timestamps displayed using client's `profiles.timezone` via `Intl.DateTimeFormat`.

## UI Design

New section after the existing content, titled "Weekly Check-In Dashboard" with `ClipboardCheck` icon.

Three columns (responsive: stacked on mobile):

| Submitted Wednesday | Submitted Thursday | Not Submitted (At-Risk) |
|---|---|---|
| Green left border | Blue left border | Red left border |
| Client name (tappable → `/clients/:id?tab=checkin`) | Same | Same + ⚠️ badge |
| Timestamp in client's TZ | Timestamp in client's TZ | "Overdue" label |

Below the three columns, a separate "Off-Week Clients" row showing biweekly clients with a `🔄` badge and "Next: [date]" label.

Each client name navigates to `/clients/${clientId}` (their check-in history tab).

## Realtime

Subscribe to `postgres_changes` on `checkin_submissions` for the coach's client IDs. On new insert, re-fetch the dashboard data (invalidate cache).

## Files Changed

| File | Change |
|------|--------|
| **Migration** | Enable realtime on `checkin_submissions` |
| `src/components/dashboard/CoachCommandCenter.tsx` | Add check-in dashboard section with three submission groups + biweekly off-week display + realtime subscription |

## Performance

- Parallel fetch with existing queries (added to `Promise.all`)
- Uses existing `useDataFetch` with 2-min stale time
- Realtime channel for live updates without polling
- Under 3s load guaranteed by existing timeout infrastructure

