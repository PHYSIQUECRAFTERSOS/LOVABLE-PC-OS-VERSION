
-- Fix program_workouts RLS: add explicit WITH CHECK for INSERT/UPDATE
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;

CREATE POLICY "Coaches can manage program workouts" ON public.program_workouts
FOR ALL 
USING (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_weeks pw JOIN programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  OR
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_phases pp JOIN programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
)
WITH CHECK (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_weeks pw JOIN programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  OR
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_phases pp JOIN programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
);
