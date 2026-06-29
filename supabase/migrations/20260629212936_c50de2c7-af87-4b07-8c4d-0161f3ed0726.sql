
-- Allow any coach/admin/manager to view phases, weeks, and workouts that belong
-- to shared master library programs (is_master = true AND is_template = true).
-- Without this, managers see the program shells but "No phases" because the
-- child rows are gated to the program's owner coach_id.

CREATE POLICY "Coaches view shared master program phases"
ON public.program_phases
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
      AND p.is_master = true
      AND p.is_template = true
      AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Coaches view shared master program weeks"
ON public.program_weeks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_weeks.program_id
      AND p.is_master = true
      AND p.is_template = true
      AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Coaches view shared master program workouts"
ON public.program_workouts
FOR SELECT
USING (
  (
    phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_phases pp
      JOIN public.programs p ON p.id = pp.program_id
      WHERE pp.id = program_workouts.phase_id
        AND p.is_master = true
        AND p.is_template = true
        AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    )
  ) OR (
    week_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id
        AND p.is_master = true
        AND p.is_template = true
        AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    )
  )
);
