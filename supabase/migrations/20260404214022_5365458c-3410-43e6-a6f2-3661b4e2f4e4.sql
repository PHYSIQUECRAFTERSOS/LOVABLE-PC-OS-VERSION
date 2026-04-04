
-- Step 1: Add missing indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id 
  ON public.workout_exercises (workout_id);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise_id 
  ON public.workout_exercises (exercise_id);

CREATE INDEX IF NOT EXISTS idx_program_workouts_week_id 
  ON public.program_workouts (week_id);

-- Step 2: Drop the redundant/expensive SELECT policy
DROP POLICY IF EXISTS "Assigned clients can view workout exercises via linked program" ON public.workout_exercises;
DROP POLICY IF EXISTS "Users can view workout exercises" ON public.workout_exercises;

-- Step 3: Create two clean, fast SELECT policies

-- Policy 1: Direct owner access (coach, client, or admin on the parent workout)
CREATE POLICY "Owner can view workout exercises"
  ON public.workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND (w.coach_id = auth.uid() OR w.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Policy 2: Program-assigned clients (uses fast SECURITY DEFINER function)
CREATE POLICY "Program clients can view workout exercises"
  ON public.workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      JOIN program_workouts pw ON pw.workout_id = w.id
      LEFT JOIN program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN program_weeks pwk ON pwk.id = pw.week_id
      WHERE w.id = workout_exercises.workout_id
        AND is_client_assigned_to_program(COALESCE(pp.program_id, pwk.program_id), auth.uid())
    )
  );
