CREATE OR REPLACE FUNCTION public.replace_workout_exercise_plan(
  _workout_id uuid,
  _name text,
  _instructions text,
  _is_accessory boolean,
  _exercises jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT w.client_id
  INTO _client_id
  FROM public.workouts w
  WHERE w.id = _workout_id
    AND (
      w.coach_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.coach_clients cc
        WHERE cc.client_id = w.client_id
          AND cc.coach_id = auth.uid()
          AND cc.status = 'active'
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have permission to edit this workout';
  END IF;

  UPDATE public.workouts
  SET
    name = COALESCE(NULLIF(btrim(_name), ''), name),
    instructions = _instructions,
    is_accessory = COALESCE(_is_accessory, is_accessory),
    updated_at = now()
  WHERE id = _workout_id;

  DELETE FROM public.workout_exercises
  WHERE workout_id = _workout_id;

  IF jsonb_array_length(COALESCE(_exercises, '[]'::jsonb)) = 0 THEN
    RETURN;
  END IF;

  WITH input_rows AS (
    SELECT
      row_number() OVER ()::integer AS fallback_order,
      x.exercise_id,
      x.exercise_order,
      x.sets,
      x.reps,
      x.tempo,
      x.rest_seconds,
      x.rir,
      x.rpe_target,
      x.notes,
      x.superset_group,
      x.grouping_type,
      x.grouping_id
    FROM jsonb_to_recordset(_exercises) AS x(
      exercise_id uuid,
      exercise_order integer,
      sets integer,
      reps text,
      tempo text,
      rest_seconds integer,
      rir integer,
      rpe_target numeric,
      notes text,
      superset_group text,
      grouping_type text,
      grouping_id text
    )
    WHERE x.exercise_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.workout_exercises (
      workout_id,
      exercise_id,
      exercise_order,
      sets,
      reps,
      tempo,
      rest_seconds,
      rir,
      rpe_target,
      notes,
      superset_group,
      grouping_type,
      grouping_id
    )
    SELECT
      _workout_id,
      exercise_id,
      COALESCE(exercise_order, fallback_order),
      GREATEST(COALESCE(sets, 1), 0),
      NULLIF(reps, ''),
      NULLIF(tempo, ''),
      rest_seconds,
      rir,
      rpe_target,
      NULLIF(notes, ''),
      NULLIF(superset_group, ''),
      NULLIF(grouping_type, ''),
      NULLIF(grouping_id, '')
    FROM input_rows
    ORDER BY COALESCE(exercise_order, fallback_order)
    RETURNING id, sets, reps, rpe_target
  )
  INSERT INTO public.workout_sets (
    workout_exercise_id,
    set_number,
    rep_target,
    rpe_target,
    set_type
  )
  SELECT
    inserted.id,
    series.set_number,
    inserted.reps,
    inserted.rpe_target,
    'working'
  FROM inserted
  CROSS JOIN LATERAL generate_series(1, GREATEST(inserted.sets, 0)) AS series(set_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_workout_exercise_plan(uuid, text, text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_workout_exercise_plan(uuid, text, text, boolean, jsonb) TO service_role;