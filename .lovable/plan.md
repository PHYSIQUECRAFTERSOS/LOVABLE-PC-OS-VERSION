

# Plan: Coach Workout Details, Phase End Dates, and Phase Deadline Alerts

## Problem Analysis

**Issue 1 — Coach calendar workout details not loading**: The `EventDetailModal` queries `workout_sessions` but does NOT filter by `client_id`. When a coach views a client's calendar via `CalendarTab`, the session query only matches by `workout_id` — but RLS policies likely restrict the coach from seeing the client's sessions without explicitly filtering by client. The coach's own user ID doesn't match, so zero results return and no exercise data shows.

**Issue 2 — No phase end date on client cards**: The Clients page (`SelectableClientCards`) shows compliance and streak but has no training phase information. Trainerize shows "Ends on [date]" and "X days left" per client.

**Issue 3 — No phase deadline section in Command Center**: The coach dashboard lacks awareness of upcoming phase expirations.

---

## Solution

### 1. Fix Coach Calendar Workout Details

**File: `src/components/calendar/EventDetailModal.tsx`**

The `loadSessionData` function needs a `clientId` prop so it can filter sessions by the correct client. Currently it queries `workout_sessions` by `workout_id` only — when a coach views a client's event, the query needs `.eq("client_id", clientId)` to find the right session.

Changes:
- Add optional `clientId?: string` prop to `EventDetailModalProps`
- Pass `clientId` into the session query: `.eq("client_id", clientId)` when provided
- Also use it for the exercises load query filter (for safety)

**File: `src/components/clients/workspace/CalendarTab.tsx`**

- Pass `clientId` prop through to `EventDetailModal`

**File: `src/pages/Calendar.tsx`**

- Pass `user?.id` as `clientId` for the client's own calendar (already works via RLS, but for consistency)

### 2. Add Phase End Date to Client Cards

**File: `src/components/clients/SelectableClientCards.tsx`**

- After fetching profiles, also fetch `client_program_assignments` (status=active/subscribed) with joined `program_phases(name, duration_weeks)` for each client
- Compute phase end date: `start_date + sum of prior phases' duration_weeks + current_phase.duration_weeks`
- Simpler approach: fetch assignment `start_date`, `current_phase_id`, and all phases for the program, compute the end date of the current phase
- Display below compliance: "Phase ends [date]" with "X days left" badge, colored amber if ≤7 days, red if overdue

### 3. Phase Deadline Section in Command Center

**File: `src/components/dashboard/CoachCommandCenter.tsx`**

- Add a new data type `PhaseDeadlineClient` with `clientId, clientName, avatarUrl, phaseName, endDate, daysLeft`
- In the `queryFn`, fetch `client_program_assignments` for all active clients with `current_phase_id`, join `program_phases` to get `duration_weeks` and all phases for the program
- Compute phase end date per client
- Split into two groups: "Due Within 7 Days" (daysLeft 1-7) and "Overdue" (daysLeft ≤ 0)
- Render this new section where "Compliance Snapshot" currently sits
- Move "Compliance Snapshot" to below the Weekly Check-In Dashboard (bottom of page)

**Phase End Date Calculation Logic:**
```text
1. Get assignment: start_date, current_phase_id, program_id
2. Get all phases for program_id, ordered by phase_order
3. Sum duration_weeks of all phases BEFORE the current phase
4. Add current phase duration_weeks
5. phase_end = start_date + total_weeks * 7 days
```

---

## Files to Edit

1. **`src/components/calendar/EventDetailModal.tsx`** — Add `clientId` prop, use in session query
2. **`src/components/clients/workspace/CalendarTab.tsx`** — Pass `clientId` to EventDetailModal
3. **`src/components/clients/SelectableClientCards.tsx`** — Fetch and display phase end dates
4. **`src/components/dashboard/CoachCommandCenter.tsx`** — Add phase deadline section, move compliance snapshot to bottom

No database changes needed — all data exists in `client_program_assignments` and `program_phases`.

