

## Root Cause: Missing Database Index Causes RLS Timeout

The **504 upstream request timeout** errors are caused by a missing index on `workout_exercises.workout_id`. Here's what happens:

1. Client queries `workout_exercises` for a specific workout
2. Postgres must evaluate 3 RLS policies on `workout_exercises`, each doing a subquery JOIN through `workouts → program_workouts → program_phases → client_program_assignments`
3. **Without an index on `workout_exercises.workout_id`**, Postgres does a sequential scan of all 957 rows, evaluating these nested subqueries for every single row
4. This exceeds the Supabase request timeout (30s), returning a 504

The `exercises` table is fine (has a permissive `true` SELECT policy). The `workouts` table has indexes on `coach_id` and `client_id`. But `workout_exercises` — the most-queried table in the training flow — is missing the critical index.

### Why reverting code won't help
Even if you revert to yesterday's code, the queries will still timeout because the RLS policies + missing index existed before any code changes. If it worked before, it was marginal — the table may have grown past the threshold, or Supabase query planner cache changed.

## Plan

### Step 1: Add missing database indexes (migration)
Create indexes on `workout_exercises` to eliminate the full table scan during RLS evaluation:

```sql
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id 
  ON public.workout_exercises (workout_id);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise_id 
  ON public.workout_exercises (exercise_id);

CREATE INDEX IF NOT EXISTS idx_program_workouts_week_id 
  ON public.program_workouts (week_id);
```

This is the **primary fix**. With the `workout_id` index, RLS evaluation goes from scanning 957 rows to a direct index lookup — sub-millisecond instead of 30+ seconds.

### Step 2: Simplify redundant RLS policies on `workout_exercises`
There are currently **3 SELECT policies** on `workout_exercises`, two of which overlap significantly. The "Assigned clients can view workout exercises via linked program" policy does a 4-table deep nested EXISTS that is extremely expensive. We should consolidate to 2 clean policies:

- **Policy 1** (owner access): coach_id or client_id match on parent workout
- **Policy 2** (program assignment access): uses `is_client_assigned_to_program()` security definer function (already exists and is fast)

### Step 3: Verify the fix works
After applying indexes and simplified policies, the same queries that were timing out should return in under 100ms.

### Summary
- **1 migration** — add 3 indexes + simplify 1 RLS policy
- **0 code changes needed** — the existing frontend code is correct
- Root cause was purely database performance, not frontend logic

