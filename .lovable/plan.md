

# Fix Daily Eval Styling + Missed Workout False Positive Bug

## Issues Found

### 1. Daily Evaluation Styling
The `daily_eval` transaction type (0 XP marker) currently falls into the red/loss styling because `xp_amount` is 0 (not > 0). Need to add a special case for `daily_eval` with grey icon background and white XP text.

### 2. False "Missed Workout" Penalty — Root Cause
The user completed workout `dbff7f91` on March 21 (confirmed: `workout_sessions` shows `status=completed, completed_at=18:26`). But the calendar event linking to that same workout still has `is_completed=false`. This caused the daily evaluation to penalize -4 XP.

**Why the calendar event wasn't marked complete**: The `WorkoutLogger` only marks a calendar event complete when `calendarEventId` is explicitly passed as a prop. If the user starts a workout from the Training page's "My Workouts" list (line 206 of Training.tsx) or from `ClientProgramView`, **no `calendarEventId` is passed**, so the calendar event stays `is_completed=false` even though the workout was completed.

**Two fixes needed:**

**Fix A — WorkoutLogger fallback lookup**: When `calendarEventId` is not provided but the workout completes, look up today's calendar event by `linked_workout_id` + `user_id`/`target_client_id` and mark it completed. This prevents future occurrences.

**Fix B — Daily evaluation cross-check**: Before penalizing a "missed workout", check `workout_sessions` to see if the linked workout was actually completed that day. If a completed session exists for that workout, skip the penalty and mark the calendar event as completed. This makes the evaluation resilient regardless of how the workout was started.

## Plan

### File 1: `src/components/ranked/XPHistoryFeed.tsx`
- Add `daily_eval` to the ICONS map (use `Trophy` or a neutral icon like `Clock`)
- Add a check: if `tx.transaction_type === "daily_eval"`, use `bg-muted/30` for icon background, `text-muted-foreground` for icon color, and `text-white` for XP amount text

### File 2: `src/components/WorkoutLogger.tsx`
- In the `finishWorkout` function, after the existing `calendarEventId` update block, add a fallback:
  ```typescript
  if (!calendarEventId && user) {
    // Find today's calendar event linked to this workout
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: calEvents } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("linked_workout_id", workoutId)
      .eq("event_date", today)
      .eq("event_type", "workout")
      .eq("is_completed", false)
      .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
      .limit(1);
    if (calEvents?.length) {
      await supabase.from("calendar_events")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", calEvents[0].id);
    }
  }
  ```

### File 3: `supabase/functions/daily-xp-evaluation/index.ts`
- In the missed workouts section (lines 233-250), before penalizing, cross-reference `workout_sessions` for each incomplete calendar event:
  - Query `workout_sessions` where `client_id = clientId`, `session_date = evalDate`, `status = 'completed'`
  - For each calendar event with `is_completed=false`, check if its `linked_workout_id` has a completed session. If yes, auto-fix the calendar event and skip the penalty
- Apply the same cross-check pattern for missed cardio (check `cardio_logs` or completed cardio events)
- Also update the `target_client_id` queries: change `.eq("user_id", clientId)` to `.or(\`user_id.eq.${clientId},target_client_id.eq.${clientId}\`)` for all calendar event lookups (missed workouts, missed cardio, missed checkins, completed events check)

### Files Changed

| File | Change |
|---|---|
| `src/components/ranked/XPHistoryFeed.tsx` | Grey/white styling for `daily_eval` entries |
| `src/components/WorkoutLogger.tsx` | Fallback calendar event lookup when `calendarEventId` not provided |
| `supabase/functions/daily-xp-evaluation/index.ts` | Cross-check workout_sessions before penalizing + support `target_client_id` |

