
CREATE OR REPLACE FUNCTION public.get_client_training_workouts(_client_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  phase text,
  is_template boolean,
  instructions text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH assigned_programs AS (
    SELECT program_id
    FROM public.client_program_assignments
    WHERE client_id = _client_id
      AND status IN ('active', 'subscribed')
  ),
  program_workout_ids AS (
    SELECT DISTINCT pw.workout_id
    FROM public.program_workouts pw
    WHERE pw.workout_id IS NOT NULL
      AND (
        pw.phase_id IN (
          SELECT ph.id FROM public.program_phases ph
          WHERE ph.program_id IN (SELECT program_id FROM assigned_programs)
        )
        OR pw.week_id IN (
          SELECT wk.id FROM public.program_weeks wk
          WHERE wk.program_id IN (SELECT program_id FROM assigned_programs)
        )
      )
  ),
  program_result AS (
    SELECT w.id, w.name, w.description, w.phase, w.is_template, w.instructions
    FROM public.workouts w
    WHERE w.id IN (SELECT workout_id FROM program_workout_ids)
  ),
  fallback_result AS (
    SELECT w.id, w.name, w.description, w.phase, w.is_template, w.instructions
    FROM public.workouts w
    WHERE w.client_id = _client_id
      AND NOT EXISTS (SELECT 1 FROM program_result)
  )
  SELECT * FROM program_result
  UNION ALL
  SELECT * FROM fallback_result;
$$;

REVOKE ALL ON FUNCTION public.get_client_training_workouts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_training_workouts(uuid) TO authenticated;
