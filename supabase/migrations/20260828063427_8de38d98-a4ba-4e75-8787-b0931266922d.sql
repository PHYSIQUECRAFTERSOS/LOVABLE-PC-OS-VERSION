CREATE OR REPLACE FUNCTION public.workout_visible_via_program(_workout_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM program_workouts pw
    LEFT JOIN program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN program_weeks pwk ON pwk.id = pw.week_id
    JOIN programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    LEFT JOIN client_program_assignments cpa
      ON cpa.program_id = p.id
     AND cpa.client_id = _user_id
     AND cpa.status = ANY (ARRAY['active','subscribed'])
    WHERE pw.workout_id = _workout_id
      AND (
        cpa.id IS NOT NULL
        OR (
          p.is_master AND p.is_template AND (
            has_role(_user_id, 'coach'::app_role)
            OR has_role(_user_id, 'admin'::app_role)
            OR has_role(_user_id, 'manager'::app_role)
          )
        )
      )
  )
$$;

DROP POLICY IF EXISTS "workouts_select_all_paths" ON public.workouts;
DROP POLICY IF EXISTS "Coaches view shared master workouts" ON public.workouts;
DROP POLICY IF EXISTS "Managers can view shared master workouts" ON public.workouts;

CREATE POLICY "workouts_select_all_paths"
ON public.workouts
FOR SELECT
USING (
  coach_id = (SELECT auth.uid())
  OR client_id = (SELECT auth.uid())
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.workout_visible_via_program(id, (SELECT auth.uid()))
);