-- ============================================
-- PHASE 2: Consolidate SELECT policies
-- ============================================

-- Step 1: Drop ALL existing SELECT policies on workouts (exact names from pg_policies)
DROP POLICY IF EXISTS "Coaches can view their workouts" ON public.workouts;
DROP POLICY IF EXISTS "Assigned clients can view workouts via linked program assignmen" ON public.workouts;

-- Step 2: Drop ALL existing SELECT policies on workout_exercises (exact names from pg_policies)
DROP POLICY IF EXISTS "Owner can view workout exercises" ON public.workout_exercises;
DROP POLICY IF EXISTS "Program clients can view workout exercises" ON public.workout_exercises;
-- Also drop any legacy trailing-space variant that may have survived
DROP POLICY IF EXISTS "Assigned clients can view workout exercises via linked program " ON public.workout_exercises;
DROP POLICY IF EXISTS "Assigned clients can view workout exercises via linked program" ON public.workout_exercises;

-- Step 3: Create ONE unified SELECT policy on workouts
CREATE POLICY "workouts_select_all_paths"
ON public.workouts
FOR SELECT
USING (
  -- Path 1: Coach/admin owns the workout
  coach_id = auth.uid()
  OR
  -- Path 2: Client directly assigned on the workout row
  client_id = auth.uid()
  OR
  -- Path 3: Admin role
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Path 4: Client assigned via program (phase or week path)
  EXISTS (
    SELECT 1
    FROM program_workouts pw
    LEFT JOIN program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN program_weeks pwk ON pwk.id = pw.week_id
    JOIN client_program_assignments cpa 
      ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id
      AND cpa.client_id = auth.uid()
      AND cpa.status IN ('active', 'subscribed')
  )
);

-- Step 4: Create ONE unified SELECT policy on workout_exercises
CREATE POLICY "workout_exercises_select_all_paths"
ON public.workout_exercises
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workouts w
    WHERE w.id = workout_exercises.workout_id
      AND (
        -- Path 1: Coach/admin owns parent workout
        w.coach_id = auth.uid()
        OR
        -- Path 2: Client directly on parent workout
        w.client_id = auth.uid()
        OR
        -- Path 3: Admin role
        has_role(auth.uid(), 'admin'::app_role)
        OR
        -- Path 4: Client assigned via program
        EXISTS (
          SELECT 1
          FROM program_workouts pw
          LEFT JOIN program_phases pp ON pp.id = pw.phase_id
          LEFT JOIN program_weeks pwk ON pwk.id = pw.week_id
          JOIN client_program_assignments cpa 
            ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
          WHERE pw.workout_id = w.id
            AND cpa.client_id = auth.uid()
            AND cpa.status IN ('active', 'subscribed')
        )
      )
  )
);