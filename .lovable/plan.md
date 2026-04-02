

## Rewrite Command Center Compliance to Use Calendar Events Only

### Problem
Compliance is currently calculated from:
- `workout_sessions` (completed vs total sessions in last 7 days) — wrong because a brand-new client with no scheduled workouts shows "7 missed workouts"
- `nutrition_logs` (days logged out of 7) — included in compliance but shouldn't be
- `weekly_checkins` (binary check) — correct intent but should also be calendar-based

This means:
- **Zane** (just joined, no workouts scheduled before today) shows 7 missed workouts — should show 100% (0 events, 0 missed)
- **Scott** (just added, no program yet) shows 7 missed workouts — should show 100%
- **Kevin** (doing everything) shows 58% because nutrition weighting drags it down

### Solution

**File: `src/components/dashboard/CoachCommandCenter.tsx`**

Replace the data source and compliance formula:

**1. Fetch calendar events for last 7 days instead of workout_sessions/nutrition_logs**
- Query `calendar_events` where `event_type` in `('workout', 'checkin')` for the last 7 days
- Filter to events belonging to each client (via `target_client_id` OR `user_id`)
- This is the source of truth for what was *actually scheduled*

**2. New per-client compliance calculation**
```
scheduledWorkouts = calendar events with event_type = 'workout' for this client in last 7 days
completedWorkouts = those where is_completed = true
scheduledCheckins = calendar events with event_type = 'checkin' for this client in last 7 days  
completedCheckins = those where is_completed = true

totalScheduled = scheduledWorkouts + scheduledCheckins
totalCompleted = completedWorkouts + completedCheckins

compliance = totalScheduled > 0 ? round((totalCompleted / totalScheduled) * 100) : 100
```

If a client has zero scheduled events → 100% compliance (nothing to miss).

**3. Update action item reasons**
- Remove "Xd no nutrition log" reason entirely
- Keep "X missed workouts" (now = scheduled workout events not completed)
- Keep "No check-in" (now = scheduled checkin events not completed)
- Update threshold: only flag if there are actual missed events

**4. Update snapshot section**
- `trainingPct` = avg of per-client workout compliance (scheduled vs completed workout events)
- Remove `nutritionPct` from the `ComplianceSnapshot` interface (or repurpose it)
- `checkinPct` = avg of per-client checkin compliance from calendar events

**5. Cross-reference with workout_sessions for accuracy**
- For workout calendar events, also check `workout_sessions` table (existing double-verification pattern) to catch cases where a workout was completed but calendar wasn't flagged

**6. Remove nutrition from weighted compliance formula**
- Old: `training * 0.4 + nutrition * 0.35 + checkin * 0.15 + 50 * 0.1`
- New: `totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 100`
- Simple, transparent, calendar-driven

### Data flow change
```text
Before:
  workout_sessions (last 7d) → training compliance
  nutrition_logs (last 7d)   → nutrition compliance  
  weekly_checkins (last 7d)  → checkin binary
  → weighted formula → overallCompliance

After:
  calendar_events (last 7d, type = workout|checkin) → per client
  + workout_sessions cross-check for completion verification
  → (completed / scheduled) * 100 → overallCompliance
  → 100% if nothing scheduled
```

### Files Modified
- `src/components/dashboard/CoachCommandCenter.tsx` — rewrite compliance data fetching and calculation

### Improvements included
1. **Zero-event = 100%**: New clients with no scheduled events won't be flagged
2. **Calendar is source of truth**: Compliance reflects what the coach actually scheduled, not arbitrary 7-day expectations
3. **Double-verification**: Cross-references `workout_sessions` completion status with calendar events (existing pattern from the XP engine)
4. **Cleaner action items**: No more "7d no nutrition log" noise for clients who aren't expected to log nutrition
5. **Accurate streak**: Streak calculated from consecutive days with all scheduled events completed

