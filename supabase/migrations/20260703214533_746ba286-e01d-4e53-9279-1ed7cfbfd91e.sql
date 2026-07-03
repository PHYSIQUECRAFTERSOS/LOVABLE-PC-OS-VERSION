
-- 1. Allow managers to manage program_phases they own (mirrors coach policy).
CREATE POLICY "Managers manage their program phases"
ON public.program_phases
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
      AND p.coach_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
      AND p.coach_id = auth.uid()
  )
);

-- 2. Allow managers to manage program_workouts inside phases/weeks of programs they own.
CREATE POLICY "Managers manage program workouts"
ON public.program_workouts
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND (
    (phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_phases pp
      JOIN public.programs p ON p.id = pp.program_id
      WHERE pp.id = program_workouts.phase_id AND p.coach_id = auth.uid()
    ))
    OR
    (week_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id AND p.coach_id = auth.uid()
    ))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND (
    (phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_phases pp
      JOIN public.programs p ON p.id = pp.program_id
      WHERE pp.id = program_workouts.phase_id AND p.coach_id = auth.uid()
    ))
    OR
    (week_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id AND p.coach_id = auth.uid()
    ))
  )
);

-- 3. Clean up today's empty phases left over from failed imports (safe: only
-- deletes phases with zero attached program_workouts).
DELETE FROM public.program_phases pp
WHERE pp.created_at > now() - interval '1 day'
  AND NOT EXISTS (
    SELECT 1 FROM public.program_workouts pw WHERE pw.phase_id = pp.id
  );
