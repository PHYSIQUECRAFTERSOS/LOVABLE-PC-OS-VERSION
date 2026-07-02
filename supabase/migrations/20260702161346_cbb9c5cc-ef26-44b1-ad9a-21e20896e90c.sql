
CREATE POLICY "Coaches view shared master workouts"
ON public.workouts
FOR SELECT
USING (
  (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1
    FROM public.program_workouts pw
    LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
    JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id
      AND p.is_master = true
      AND p.is_template = true
  )
);

CREATE POLICY "Coaches view shared master workout exercises"
ON public.workout_exercises
FOR SELECT
USING (
  (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1
    FROM public.program_workouts pw
    LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
    JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workout_exercises.workout_id
      AND p.is_master = true
      AND p.is_template = true
  )
);
