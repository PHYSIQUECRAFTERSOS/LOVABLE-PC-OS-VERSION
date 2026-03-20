

# Fix: "Previous" Column Not Showing Last Performance Data

## Problem
The "Previous" column in the workout logger always shows "—" instead of the client's last logged weight × reps for each exercise.

## Root Cause
**Lines 337-361 of `WorkoutLogger.tsx`**: The current logic fetches the last completed session *for the same workout_id*, then pulls exercise logs from that single session. This fails when:
- The client has never completed this exact workout before (common for new program phases)
- Exercises appear across multiple workouts (e.g., "Bench Press" in Push A and Push B)
- Exercises were switched in a previous session

## Fix
Replace the per-workout-session lookup with a **per-exercise lookup** — for each exercise in the current workout, find its most recent `exercise_logs` entry across ALL completed sessions, regardless of which workout it belonged to.

### Implementation (single file change)

**File: `src/components/WorkoutLogger.tsx` — lines 337-362**

Replace the two-step query (find last session → get logs from it) with a single query pattern:

```
For each exercise_id in the current workout:
  SELECT exercise_id, set_number, weight, reps, rir
  FROM exercise_logs
  WHERE exercise_id IN (...all current exercise IDs)
    AND session_id IN (
      -- Get the latest completed session per exercise
      SELECT DISTINCT ON (el.exercise_id) ws.id
      FROM exercise_logs el
      JOIN workout_sessions ws ON ws.id = el.session_id
      WHERE ws.client_id = user.id
        AND ws.status = 'completed'
        AND el.exercise_id IN (...ids)
      ORDER BY el.exercise_id, ws.created_at DESC
    )
```

Since Supabase JS client doesn't support subqueries, the practical approach:
1. Query `exercise_logs` joined with `workout_sessions` for all exercise IDs, filtered by `client_id` and `status = 'completed'`, ordered by `created_at DESC`
2. In JS, group by `exercise_id` and keep only the logs from each exercise's most recent session

This ensures "Previous" shows data even if the exercise was last performed in a completely different workout.

### Technical Detail
- Query all `exercise_logs` for the user's completed sessions matching any of the current exercise IDs
- Group results by `exercise_id`, then by `session_id`, keeping only the most recent session's logs per exercise
- No database migration needed — uses existing tables and indexes

