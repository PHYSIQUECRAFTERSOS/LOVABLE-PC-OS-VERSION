-- ============================================================
-- Fix all feature-blocking RLS policies
-- ============================================================

-- 1. EXERCISES: Ensure INSERT policy works for coaches
-- The original policy used has_role which is correct — keep it simple
DROP POLICY IF EXISTS "Coaches can create exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coaches and admins can create exercises" ON public.exercises;
CREATE POLICY "Coaches and admins can create exercises"
ON public.exercises FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
);

-- Ensure exercises SELECT is truly open to all authenticated users
DROP POLICY IF EXISTS "Anyone can view exercises" ON public.exercises;
CREATE POLICY "Anyone can view exercises"
ON public.exercises FOR SELECT TO authenticated
USING (true);

-- 2. PROGRAM_WORKOUTS: Fix INSERT policy to avoid recursive RLS chain
-- Use a simpler, more direct check via programs table only
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;
CREATE POLICY "Coaches can manage program workouts"
ON public.program_workouts FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.program_phases pp
    JOIN public.programs prog ON prog.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
    AND (prog.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
  OR
  EXISTS (
    SELECT 1 FROM public.program_weeks pw
    JOIN public.programs prog ON prog.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
    AND (prog.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.program_phases pp
    JOIN public.programs prog ON prog.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
    AND (prog.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
  OR
  EXISTS (
    SELECT 1 FROM public.program_weeks pw
    JOIN public.programs prog ON prog.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
    AND (prog.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 3. PROGRAM_PHASES: Ensure SELECT works without complex RLS chain
DROP POLICY IF EXISTS "Coaches manage their program phases" ON public.program_phases;
CREATE POLICY "Coaches manage their program phases"
ON public.program_phases FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs prog
    WHERE prog.id = program_phases.program_id
    AND (prog.coach_id = auth.uid() OR prog.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.programs prog
    WHERE prog.id = program_phases.program_id
    AND (prog.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 4. SAVED_MEALS: Ensure INSERT has explicit WITH CHECK
DROP POLICY IF EXISTS "Clients manage own saved meals" ON public.saved_meals;
CREATE POLICY "Clients manage own saved meals"
ON public.saved_meals FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- 5. NUTRITION_LOGS: Ensure INSERT has explicit WITH CHECK (coach scan logging)
DROP POLICY IF EXISTS "Clients can manage own logs" ON public.nutrition_logs;
CREATE POLICY "Clients can manage own logs"
ON public.nutrition_logs FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- 6. CALENDAR_EVENTS: Ensure coaches can read events they created (user_id = coach)
-- The existing "Users can manage own events" policy covers this:
-- USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
-- Already correct after the ScheduleEventForm fix. No change needed here.

-- 7. Grant program_phases SECURITY DEFINER bypass to avoid recursive RLS in subqueries
-- Use a helper function to check program ownership without RLS interference
CREATE OR REPLACE FUNCTION public.coach_owns_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs
    WHERE id = p_program_id
    AND (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
$$;

-- Update program_workouts to use the security definer function
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;
CREATE POLICY "Coaches can manage program workouts"
ON public.program_workouts FOR ALL TO authenticated
USING (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp
    WHERE pp.id = program_workouts.phase_id
    AND public.coach_owns_program(pp.program_id)
  ))
  OR
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw
    WHERE pw.id = program_workouts.week_id
    AND public.coach_owns_program(pw.program_id)
  ))
)
WITH CHECK (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp
    WHERE pp.id = program_workouts.phase_id
    AND public.coach_owns_program(pp.program_id)
  ))
  OR
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw
    WHERE pw.id = program_workouts.week_id
    AND public.coach_owns_program(pw.program_id)
  ))
);

-- Also update the Users can view program workouts policy
DROP POLICY IF EXISTS "Users can view program workouts" ON public.program_workouts;
CREATE POLICY "Users can view program workouts"
ON public.program_workouts FOR SELECT TO authenticated
USING (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp
    JOIN public.programs prog ON prog.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
    AND (prog.coach_id = auth.uid() OR prog.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  OR
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw
    JOIN public.programs prog ON prog.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
    AND (prog.coach_id = auth.uid() OR prog.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
);
