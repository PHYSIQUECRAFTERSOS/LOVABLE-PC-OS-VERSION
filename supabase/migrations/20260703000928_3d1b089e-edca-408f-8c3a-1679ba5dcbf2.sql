CREATE OR REPLACE FUNCTION public.get_workout_exercise_details(_workout_id uuid)
RETURNS TABLE (
  id uuid,
  workout_id uuid,
  exercise_id uuid,
  exercise_order integer,
  sets integer,
  reps text,
  rest_seconds integer,
  tempo text,
  rir integer,
  rpe_target integer,
  notes text,
  video_override text,
  progression_type text,
  weight_increment numeric,
  increment_type text,
  rpe_threshold numeric,
  progression_mode text,
  grouping_type text,
  grouping_id text,
  exercise_name text,
  primary_muscle text,
  youtube_url text,
  video_url text,
  youtube_thumbnail text,
  equipment text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed_workout AS (
    SELECT w.id
    FROM public.workouts w
    WHERE w.id = _workout_id
      AND auth.uid() IS NOT NULL
      AND (
        w.coach_id = auth.uid()
        OR w.client_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.coach_clients cc
          WHERE cc.client_id = w.client_id
            AND cc.coach_id = auth.uid()
            AND cc.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM public.program_workouts pw
          LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
          LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
          JOIN public.client_program_assignments cpa
            ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
           AND cpa.status IN ('active', 'subscribed')
          WHERE pw.workout_id = w.id
            AND (
              cpa.client_id = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.coach_clients cc
                WHERE cc.client_id = cpa.client_id
                  AND cc.coach_id = auth.uid()
                  AND cc.status = 'active'
              )
            )
        )
      )
  )
  SELECT
    we.id,
    we.workout_id,
    we.exercise_id,
    we.exercise_order,
    we.sets,
    we.reps,
    we.rest_seconds,
    we.tempo,
    we.rir,
    we.rpe_target,
    we.notes,
    we.video_override,
    we.progression_type,
    we.weight_increment,
    we.increment_type,
    we.rpe_threshold,
    we.progression_mode,
    we.grouping_type,
    we.grouping_id,
    e.name AS exercise_name,
    e.primary_muscle,
    e.youtube_url,
    e.video_url,
    e.youtube_thumbnail,
    e.equipment
  FROM public.workout_exercises we
  JOIN allowed_workout aw ON aw.id = we.workout_id
  LEFT JOIN public.exercises e ON e.id = we.exercise_id
  ORDER BY we.exercise_order ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_workout_exercise_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workout_exercise_details(uuid) TO service_role;