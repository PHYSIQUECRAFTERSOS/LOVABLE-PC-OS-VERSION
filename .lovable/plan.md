

# Add "Yesterday's Workout Results" Sections to Coach Command Center

## What We're Building

Two new sections in the Coach Command Center, placed after the existing "Clients Requiring Attention" section:

1. **Completed Workouts Yesterday** — clients who finished their scheduled workout(s) yesterday, with a "Congrats" message button
2. **Missed Workouts Yesterday** — clients who had a workout scheduled yesterday but didn't complete it, with a "Check In" message button

Both sections only show **your** assigned clients (via `coach_clients`). This is simpler and more actionable than Trainerize's over-filtered activity feed.

## Data Source

The existing `queryFn` already fetches `workout_sessions` for the last 7 days. We'll add a parallel query for `calendar_events` where `event_type = 'workout'` and `event_date = yesterday` to know who had workouts **scheduled**. Then cross-reference with `workout_sessions` to determine completed vs missed.

## Changes — Single File: `CoachCommandCenter.tsx`

### Data Layer (inside `queryFn`)

Add to the parallel fetch:
```typescript
const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

const calendarReq = supabase
  .from("calendar_events")
  .select("user_id, linked_workout_id, is_completed, title")
  .in("user_id", clientIds)
  .eq("event_date", yesterday)
  .eq("event_type", "workout");
```

Then compute two new arrays:
- `completedYesterday`: clients who had a workout event and it's marked completed OR have a completed `workout_session` for yesterday
- `missedYesterday`: clients who had a workout event but did NOT complete it

Add these to the `CommandCenterData` interface and return value.

### UI Layer

Two new card sections between "Clients Requiring Attention" and "Compliance Snapshot":

**Completed Yesterday** — green-tinted card with CheckCircle2 icon, showing each client with avatar, name, workout title, and a "Congrats" button that navigates to `/messages`.

**Missed Yesterday** — amber/red-tinted card with XCircle icon, showing each client with avatar, name, workout title, and a "Check In" button that navigates to `/messages`.

Both sections collapse to a simple "No workouts scheduled yesterday" message when empty.

### Improvements Included
- Workout title shown alongside client name so coach knows which session was hit/missed
- "Message" buttons on each row for instant outreach (same pattern as existing At-Risk section)
- Counts shown as badges in section headers
- Sections are compact — one row per client, no excess filtering UI

## Files Changed

| File | Change |
|------|--------|
| `src/components/dashboard/CoachCommandCenter.tsx` | Add yesterday workout data fetch, two new UI sections with message buttons |

