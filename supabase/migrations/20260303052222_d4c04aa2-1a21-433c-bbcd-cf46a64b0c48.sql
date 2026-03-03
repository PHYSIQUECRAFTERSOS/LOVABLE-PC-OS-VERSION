
-- Drop old policies
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;
DROP POLICY IF EXISTS "Users can view program workouts" ON public.program_workouts;

-- New policy: coaches can manage via week_id OR phase_id path
CREATE POLICY "Coaches can manage program workouts" ON public.program_workouts
FOR ALL USING (
  -- Via week_id path
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_weeks pw JOIN programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  OR
  -- Via phase_id path
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_phases pp JOIN programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
);

-- New SELECT policy for viewing
CREATE POLICY "Users can view program workouts" ON public.program_workouts
FOR SELECT USING (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_weeks pw JOIN programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  OR
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM program_phases pp JOIN programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
);
