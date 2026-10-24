# Fix false "Completed" workouts on the coach's client Dash tab

## What Keith's records show
- Thu Oct 22, "Day 3: PULL B": scheduled, **never started in the app**. No workout session exists that day.
- Fri Oct 23 (today), "DAY 4: Push B": started 5:47 PM, finished 6:39 PM, marked complete on the calendar.
- Last week's PULL B (Oct 15) was completed.

So the calendar and the "Missed Yesterday" list are both right: nothing was logged on Oct 22. If Keith says he trained Thursday, he either did it without the app or logged it under a different day. Today's push workout counts for today, not Thursday.

## What's actually wrong (two bugs in the coach's client Dash tab)
1. **False checkmark.** The Dash tab marks a scheduled workout as done if the client finished the *same workout at any point in the last 30 days*. Keith finished PULL B on Oct 15, so Oct 22's PULL B showed as done. Every client with weekly repeating workouts can hit this.
2. **Wrong date in the popup.** The popup reads "2026-10-22" as midnight UTC. In Pacific time that's Oct 21, so it showed "21 Oct." The same bug is in a second date line in that popup.

## Fix
- Dash tab: a workout only counts as done if its calendar entry is checked off, **or** a finished session for that workout exists on that exact local day (client's day, not UTC). No more borrowing last week's completion.
- Workout popup: show the event's real calendar day, using the existing local-date helper (as with the progress photo fix).
- Search the other calendar and dashboard views for the same two patterns (date read as UTC, completion matched only by workout) and fix any I find.
- Add tests: "PULL B done Oct 15 does not mark Oct 22 done" and "event date 2026-10-22 shows Oct 22 in Pacific time."

## Not changing
- Command Center "Missed Yesterday" logic (it correctly reports Oct 22 as missed).
- Keith's data. If he really trained Thursday, you or he can check off Oct 22 on his calendar.

## Technical details
- `SummaryTab.tsx` ~L455/472-484: completed sessions query adds `completed_at`; match on `linked_workout_id` + `format(new Date(completed_at),'yyyy-MM-dd') === event_date`.
- `EventDetailModal.tsx` L405, L508: `new Date(event.event_date)` → `parseLocalDate(event.event_date)`.
- `ComplianceStreak.tsx` L33 and an `rg` sweep for `new Date(<ymd>)` in the calendar/dashboard.
- Pull the match rule into a small pure helper so the test doesn't depend on React.
