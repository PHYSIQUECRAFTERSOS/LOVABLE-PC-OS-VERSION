

## Fix: Workouts Not Loading for Program-Assigned Clients (RLS Bug)

### Root Cause (Confirmed by Data)

The `workouts` and `workout_exercises` tables have SELECT RLS policies that only check `coach_id = auth.uid() OR client_id = auth.uid()`. Clients whose workouts come through **program assignments** (where `client_id` is NULL on the workout row) are silently blocked.

| Client | Direct workouts (client_id set) | Program workouts (client_id NULL) | Status |
|--------|---:|---:|--------|
| Kevin (Client) | 15 | 0 | Works |
| Scott | 4 | 0 | Works |
| Test Account | 20 | 0 | Works |
| **Zane** | **0** | **5** | **Broken** |
| **Lucy** | **1** | **4** | **Partially broken** |

### Fix: One Database Migration

Update the SELECT policies on both `workouts` and `workout_exercises` to add an OR condition that checks program assignment membership:

**New condition added to both policies:**
```sql
EXISTS (
  SELECT 1 FROM program_workouts pw
  JOIN program_phases pp ON pp.id = pw.phase_id
  JOIN client_program_assignments cpa ON cpa.program_id = pp.program_id
  WHERE pw.workout_id = workouts.id
    AND cpa.client_id = auth.uid()
    AND cpa.status IN ('active', 'subscribed')
)
```

This covers:
1. `workouts` SELECT policy — so clients can see their assigned workouts
2. `workout_exercises` SELECT policy — so exercise details load when starting a workout

### No Frontend Changes Needed

The queries in `Training.tsx`, `TodayWorkout.tsx`, `ClientProgramView.tsx`, and `WorkoutLogger.tsx` are all correct. They're just being silently blocked by RLS returning empty results.

### Files Changed

| Asset | Change |
|-------|--------|
| Database migration | Drop + recreate 2 SELECT policies on `workouts` and `workout_exercises` |

