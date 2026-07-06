-- Ensure management team members can fully work inside shared Master Library programs
-- while clients remain limited to assigned programs/workouts.

-- Helper: staff users who may edit shared master training library content.
CREATE OR REPLACE FUNCTION public.can_manage_shared_master_library(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'manager'::public.app_role);
$$;

-- Helper: is a program a shared master/template program?
CREATE OR REPLACE FUNCTION public.is_shared_master_program(_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.programs p
    WHERE p.id = _program_id
      AND p.is_master = true
      AND p.is_template = true
  );
$$;

-- Helper: is a workout linked to any shared master/template program?
CREATE OR REPLACE FUNCTION public.is_shared_master_workout(_workout_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.program_workouts pw
    LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
    JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = _workout_id
      AND p.is_master = true
      AND p.is_template = true
  );
$$;

-- Manager/admin direct edit policies for shared master programs and nested structure.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'programs'
      AND policyname = 'Managers can edit shared master programs'
  ) THEN
    CREATE POLICY "Managers can edit shared master programs"
    ON public.programs
    FOR UPDATE
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND is_master = true
      AND is_template = true
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND is_master = true
      AND is_template = true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'program_phases'
      AND policyname = 'Managers can edit shared master program phases'
  ) THEN
    CREATE POLICY "Managers can edit shared master program phases"
    ON public.program_phases
    FOR ALL
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_program(program_id)
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_program(program_id)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'program_weeks'
      AND policyname = 'Managers can edit shared master program weeks'
  ) THEN
    CREATE POLICY "Managers can edit shared master program weeks"
    ON public.program_weeks
    FOR ALL
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_program(program_id)
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_program(program_id)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'program_workouts'
      AND policyname = 'Managers can edit shared master program workouts'
  ) THEN
    CREATE POLICY "Managers can edit shared master program workouts"
    ON public.program_workouts
    FOR ALL
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND (
        (phase_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.program_phases pp
          WHERE pp.id = program_workouts.phase_id
            AND public.is_shared_master_program(pp.program_id)
        ))
        OR
        (week_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.program_weeks pw
          WHERE pw.id = program_workouts.week_id
            AND public.is_shared_master_program(pw.program_id)
        ))
      )
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND (
        (phase_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.program_phases pp
          WHERE pp.id = program_workouts.phase_id
            AND public.is_shared_master_program(pp.program_id)
        ))
        OR
        (week_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.program_weeks pw
          WHERE pw.id = program_workouts.week_id
            AND public.is_shared_master_program(pw.program_id)
        ))
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workouts'
      AND policyname = 'Managers can edit shared master workouts'
  ) THEN
    CREATE POLICY "Managers can edit shared master workouts"
    ON public.workouts
    FOR UPDATE
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_workout(id)
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_workout(id)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_exercises'
      AND policyname = 'Managers can edit shared master workout exercises'
  ) THEN
    CREATE POLICY "Managers can edit shared master workout exercises"
    ON public.workout_exercises
    FOR ALL
    TO authenticated
    USING (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_workout(workout_id)
    )
    WITH CHECK (
      public.can_manage_shared_master_library(auth.uid())
      AND public.is_shared_master_workout(workout_id)
    );
  END IF;
END $$;

-- Update the batched metadata RPC so shared master workouts show exercise counts/thumbnails for managers.
CREATE OR REPLACE FUNCTION public.get_workout_meta_batch(_workout_ids uuid[])
RETURNS TABLE(workout_id uuid, exercise_count integer, estimated_minutes integer, thumbnail_url text, youtube_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
        OR (
          public.can_manage_shared_master_library(auth.uid())
          AND public.is_shared_master_workout(w.id)
        )
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

-- Update the workout details RPC so managers can open exercises inside shared Master Library workouts.
CREATE OR REPLACE FUNCTION public.get_workout_exercise_details(_workout_id uuid)
RETURNS TABLE(id uuid, workout_id uuid, exercise_id uuid, exercise_order integer, sets integer, reps text, rest_seconds integer, tempo text, rir integer, rpe_target integer, notes text, video_override text, progression_type text, weight_increment numeric, increment_type text, rpe_threshold numeric, progression_mode text, grouping_type text, grouping_id text, exercise_name text, primary_muscle text, youtube_url text, video_url text, youtube_thumbnail text, equipment text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
        OR (
          public.can_manage_shared_master_library(auth.uid())
          AND public.is_shared_master_workout(w.id)
        )
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

-- Update the edit RPC so managers/admins can edit exercises inside shared Master Library workouts.
CREATE OR REPLACE FUNCTION public.replace_workout_exercise_plan(_workout_id uuid, _name text, _instructions text, _is_accessory boolean, _exercises jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      OR (
        public.can_manage_shared_master_library(auth.uid())
        AND public.is_shared_master_workout(w.id)
      )
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

GRANT EXECUTE ON FUNCTION public.can_manage_shared_master_library(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shared_master_program(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shared_master_workout(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workout_meta_batch(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workout_exercise_details(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_workout_exercise_plan(uuid, text, text, boolean, jsonb) TO authenticated, service_role;