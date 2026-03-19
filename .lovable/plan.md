

## Issues Identified

### 1. Duplicate workouts on calendar
In `CalendarTab.tsx` line 356-371, `getEventsForDay()` merges **both** `workout_sessions` AND `calendar_events` of type "workout". When a client completes a workout that was scheduled via a calendar event, both the original calendar event AND the workout session appear — creating duplicates. Additionally, if the same workout is linked to multiple calendar events (stale scheduling), those all show.

**Fix**: In `getEventsForDay()`, deduplicate by checking if a session's `workout_id` matches a calendar event's `linked_workout_id` on the same day. If a calendar event already exists for that workout, skip the session entry. Also update the calendar event's completion status from sessions data (so green checkmarks are accurate).

### 2. Dashboard actions not showing workout as completed
In `SummaryTab.tsx` line 357-358, the "Today's Actions" only pulls from `calendar_events.is_completed`. When a client completes a workout through the WorkoutLogger (which updates `workout_sessions.completed_at`), the `calendar_events.is_completed` flag may not be synced. 

**Fix**: After fetching actions, cross-reference workout-type actions with `workout_sessions` for the same date/client to mark them completed if a matching completed session exists.

### 3. Coach can't click actions to see details
The actions in SummaryTab are plain `<div>` elements with no click handlers or event detail modal.

**Fix**: Make action items clickable. Import and wire up `EventDetailModal`. When a coach clicks an action, fetch the full calendar event data, open the modal showing details (and workout summary for completed workouts).

## Plan

### Step 1: Fix duplicate workouts on CalendarTab
- In `getEventsForDay()`, after building `daySessions` and `dayEvents`, filter out sessions that already have a matching calendar event (by `linked_workout_id`). Also merge session completion status into the matching calendar event.

### Step 2: Fix workout completion status on SummaryTab dashboard  
- After fetching `actions` from calendar_events, also fetch `workout_sessions` for the selected date. Cross-reference: if a calendar event has `linked_workout_id` matching a completed session's `workout_id`, mark it as completed.

### Step 3: Make actions clickable with EventDetailModal on SummaryTab
- Add state for `selectedEvent` and `showEventDetail`
- Also fetch `linked_workout_id` in the actions query
- Make each action row a clickable button that opens `EventDetailModal`
- Import `EventDetailModal` and `CalendarEvent` type
- Pass `isCoach={true}` and `clientId` to the modal

### Files to modify:
- `src/components/clients/workspace/CalendarTab.tsx` — deduplicate `getEventsForDay()`
- `src/components/clients/workspace/SummaryTab.tsx` — fix completion status, add click-to-detail

