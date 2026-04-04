
-- Fix workouts SELECT policy to include program-assigned clients
DROP POLICY IF EXISTS "Coaches can view their workouts" ON public.workouts;
CREATE POLICY "Coaches can view their workouts" ON public.workouts
FOR SELECT USING (
  coach_id = auth.uid()
  OR client_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM program_workouts pw
    JOIN program_phases pp ON pp.id = pw.phase_id
    JOIN client_program_assignments cpa ON cpa.program_id = pp.program_id
    WHERE pw.workout_id = workouts.id
      AND cpa.client_id = auth.uid()
      AND cpa.status IN ('active', 'subscribed')
  )
);

-- Fix workout_exercises SELECT policy to include program-assigned clients
DROP POLICY IF EXISTS "Users can view workout exercises" ON public.workout_exercises;
CREATE POLICY "Users can view workout exercises" ON public.workout_exercises
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = workout_exercises.workout_id
      AND (
        workouts.coach_id = auth.uid()
        OR workouts.client_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM program_workouts pw
          JOIN program_phases pp ON pp.id = pw.phase_id
          JOIN client_program_assignments cpa ON cpa.program_id = pp.program_id
          WHERE pw.workout_id = workouts.id
            AND cpa.client_id = auth.uid()
            AND cpa.status IN ('active', 'subscribed')
        )
      )
  )
);
