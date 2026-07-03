CREATE OR REPLACE FUNCTION public.get_workout_meta_batch(_workout_ids uuid[])
RETURNS TABLE (
  workout_id uuid,
  exercise_count integer,
  estimated_minutes integer,
  thumbnail_url text,
  youtube_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(_workout_ids) AS workout_id
  ),
  allowed_workouts AS (
    SELECT w.id
    FROM public.workouts w
    JOIN requested r ON r.workout_id = w.id
    WHERE auth.uid() IS NOT NULL
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
  ),
  ordered_exercises AS (
    SELECT
      we.workout_id,
      we.exercise_id,
      we.exercise_order,
      we.sets,
      we.rest_seconds,
      row_number() OVER (PARTITION BY we.workout_id ORDER BY we.exercise_order ASC) AS rn,
      count(*) OVER (PARTITION BY we.workout_id) AS ex_count,
      sum((COALESCE(we.sets, 3) * 35) + (GREATEST(COALESCE(we.sets, 3) - 1, 0) * COALESCE(we.rest_seconds, 60))) OVER (PARTITION BY we.workout_id) AS exercise_seconds
    FROM public.workout_exercises we
    JOIN allowed_workouts aw ON aw.id = we.workout_id
  ),
  aggregate_meta AS (
    SELECT DISTINCT ON (oe.workout_id)
      oe.workout_id,
      oe.ex_count::integer AS exercise_count,
      GREATEST(0, ROUND(((oe.exercise_seconds + GREATEST(oe.ex_count - 1, 0) * 50)::numeric / 60)))::integer AS estimated_minutes,
      e.youtube_thumbnail AS thumbnail_url,
      e.youtube_url
    FROM ordered_exercises oe
    LEFT JOIN public.exercises e ON e.id = oe.exercise_id AND oe.rn = 1
    ORDER BY oe.workout_id, oe.rn
  )
  SELECT
    aw.id AS workout_id,
    COALESCE(am.exercise_count, 0) AS exercise_count,
    COALESCE(am.estimated_minutes, 0) AS estimated_minutes,
    am.thumbnail_url,
    am.youtube_url
  FROM allowed_workouts aw
  LEFT JOIN aggregate_meta am ON am.workout_id = aw.id
  ORDER BY aw.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_workout_meta_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workout_meta_batch(uuid[]) TO service_role;