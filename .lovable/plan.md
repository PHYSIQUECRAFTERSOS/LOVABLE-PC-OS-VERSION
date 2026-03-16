

# Fix Week Number: Show Weeks Since Client Joined (Not Week of Year)

## Problem
The `getWeekNumber()` function in `WeeklyCheckinForm.tsx` calculates the week of the year (e.g., March 12 = Week 11). The intended behavior is to show weeks since the client joined coaching (e.g., if they joined March 16, their first check-in = Week 1).

## Solution

### Data Source for Join Date
Use `coach_clients.assigned_at` — this records when the client was linked to their coach, which is the true "start date" of their coaching program.

### Changes

**`src/components/checkin/WeeklyCheckinForm.tsx`**
- Replace the `getWeekNumber()` function (lines 59-64) that calculates week-of-year
- Add a query to fetch the client's `assigned_at` from `coach_clients` table
- New calculation: `Math.floor((now - assigned_at) / (7 * 24 * 60 * 60 * 1000)) + 1` — gives Week 1 on join week, incrementing weekly

**`src/components/checkin/CheckinSubmissionForm.tsx`**
- This form doesn't set `week_number` at all currently — add the same join-date-based week calculation here so submissions from both forms are consistent

**`src/components/checkin/ClientCheckinHistory.tsx`**
- No change needed — it already just displays `sub.week_number` from the database, so once the stored value is correct, the display is correct

### Edge Cases
- If no `coach_clients` record found (shouldn't happen for active clients), fall back to Week 1
- The week number is always at least 1 (clamped)

