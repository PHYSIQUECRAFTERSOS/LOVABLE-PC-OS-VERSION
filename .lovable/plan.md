

# Fix Check-In System: Calendar-Only Trigger Logic

## Root Cause Analysis

Two bugs share the same root cause — the system assumes ALL clients need check-ins:

**Bug 1: Dashboard "Not Submitted" shows wrong clients**
In `CheckinSubmissionDashboard.tsx` line 247, when a client has no `checkin_assignment`, it defaults `recurrence` to `"weekly"`, causing every active client to appear in "Not Submitted" — even those on programs with zero check-ins.

**Bug 2: Automated missed check-in message fires incorrectly**
In `evaluate-auto-messages/index.ts` lines 236-268, "Strategy B" fires for ANY client who hasn't submitted a check-in this week (Thursday+), regardless of whether a check-in was ever scheduled on their calendar. This is what sent the false message to Kevin (Client).

## Fix: Calendar Events as Single Source of Truth

Per your preference, check-in eligibility should be determined exclusively by whether a check-in calendar event exists for that client in the relevant time window.

### Change 1: Edge Function — Remove Strategy B

**File:** `supabase/functions/evaluate-auto-messages/index.ts`

Remove the entire "Strategy B: weekly window check" block (lines 236-268). Keep only Strategy A (calendar-based detection): a missed check-in message fires ONLY if a check-in calendar event was scheduled yesterday and was not completed AND no submission exists.

This means:
- Client on a 6-week program with no check-ins on calendar = never gets a missed check-in message
- Client on a biweekly program = only gets a message on the weeks where a check-in event is actually on their calendar
- Client on weekly program = gets a message the day after their scheduled check-in if they didn't complete it

### Change 2: Dashboard — Filter to Calendar-Scheduled Clients Only

**File:** `src/components/dashboard/CheckinSubmissionDashboard.tsx`

In the data fetch function, after loading `clientIds`, also query `calendar_events` for check-in events this week (Mon-Sun). Only include clients who have at least one check-in calendar event scheduled this week. Clients with no check-in event this week are excluded entirely (not shown in "Not Submitted", not shown in submission columns).

The query addition:
```typescript
const { data: checkinEvents } = await supabase
  .from("calendar_events")
  .select("id, target_client_id, user_id, event_date, is_completed")
  .in("event_type", ["checkin"])
  .or(clientIds.map(id => `target_client_id.eq.${id},user_id.eq.${id}`).join(","))
  .gte("event_date", mondayStr)
  .lte("event_date", sundayStr);
```

Build a Set of client IDs who have check-in events this week. Only iterate over those clients when populating buckets/notSubmitted. Everyone else is invisible to the dashboard.

### Change 3: Biweekly Off-Week Handling

The existing biweekly logic using `checkin_assignments.next_due_date` becomes redundant since the calendar is now the source of truth. If a biweekly client's off-week has no check-in event on the calendar, they simply won't appear. Keep the "Off-Week" section but populate it by checking if a client has an active `checkin_assignment` with `recurrence = "biweekly"` but no calendar check-in event this week — this gives the coach visibility that the client exists but isn't due.

## Files to Edit

1. `supabase/functions/evaluate-auto-messages/index.ts` — Remove Strategy B from `missed_checkin` case
2. `src/components/dashboard/CheckinSubmissionDashboard.tsx` — Add calendar event filter to data fetch

## Impact

- Clients on training-only or 6-week programs with no check-ins: completely invisible to the check-in dashboard and auto-messages
- Clients on biweekly programs: only appear on weeks where a check-in is on the calendar
- Clients on weekly programs: no change in behavior (they have weekly calendar events)
- Existing data: no database changes needed, purely logic fixes

