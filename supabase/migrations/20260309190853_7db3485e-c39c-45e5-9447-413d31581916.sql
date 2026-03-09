
-- Drop existing policies first
DROP POLICY IF EXISTS "Coaches can insert events for clients" ON public.calendar_events;
DROP POLICY IF EXISTS "Coaches can manage events for clients" ON public.calendar_events;

-- FIX 1: Calendar - Allow coaches to insert events for their assigned clients
CREATE POLICY "Coaches can insert events for clients"
ON public.calendar_events
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    AND EXISTS (
      SELECT 1 FROM public.coach_clients
      WHERE coach_clients.coach_id = auth.uid()
      AND coach_clients.client_id = calendar_events.user_id
    )
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Coaches can manage events for clients"
ON public.calendar_events
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_clients.coach_id = auth.uid()
    AND coach_clients.client_id = calendar_events.target_client_id
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  AND EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_clients.coach_id = auth.uid()
    AND coach_clients.client_id = calendar_events.target_client_id
  )
);

-- FIX 3: Exercises - Ensure INSERT policy covers admin role  
DROP POLICY IF EXISTS "Coaches can create exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coaches and admins can create exercises" ON public.exercises;
CREATE POLICY "Coaches and admins can create exercises"
ON public.exercises FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
);

-- FIX 4: program_workouts SELECT policy for phase_id rows
DROP POLICY IF EXISTS "Users can view program workouts" ON public.program_workouts;
CREATE POLICY "Users can view program workouts" ON public.program_workouts
FOR SELECT TO authenticated
USING (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw
    JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
    AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  OR
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp
    JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
    AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
);
