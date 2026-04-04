CREATE OR REPLACE FUNCTION public.is_client_assigned_to_program(_program_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_program_assignments cpa
    WHERE cpa.program_id = _program_id
      AND cpa.client_id = _user_id
      AND cpa.status IN ('active', 'subscribed')
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'programs'
      AND policyname = 'Assigned clients can view programs via assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view programs via assignments"
    ON public.programs
    FOR SELECT
    TO authenticated
    USING (public.is_client_assigned_to_program(id, auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_phases'
      AND policyname = 'Assigned clients can view program phases via assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view program phases via assignments"
    ON public.program_phases
    FOR SELECT
    TO authenticated
    USING (public.is_client_assigned_to_program(program_id, auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_weeks'
      AND policyname = 'Assigned clients can view program weeks via assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view program weeks via assignments"
    ON public.program_weeks
    FOR SELECT
    TO authenticated
    USING (public.is_client_assigned_to_program(program_id, auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_workouts'
      AND policyname = 'Assigned clients can view program workouts via assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view program workouts via assignments"
    ON public.program_workouts
    FOR SELECT
    TO authenticated
    USING (
      (
        phase_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.program_phases pp
          WHERE pp.id = program_workouts.phase_id
            AND public.is_client_assigned_to_program(pp.program_id, auth.uid())
        )
      )
      OR (
        week_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.program_weeks pw
          WHERE pw.id = program_workouts.week_id
            AND public.is_client_assigned_to_program(pw.program_id, auth.uid())
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workouts'
      AND policyname = 'Assigned clients can view workouts via linked program assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view workouts via linked program assignments"
    ON public.workouts
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.program_workouts pwr
        LEFT JOIN public.program_phases pp ON pp.id = pwr.phase_id
        LEFT JOIN public.program_weeks pw ON pw.id = pwr.week_id
        WHERE pwr.workout_id = workouts.id
          AND public.is_client_assigned_to_program(COALESCE(pp.program_id, pw.program_id), auth.uid())
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workout_exercises'
      AND policyname = 'Assigned clients can view workout exercises via linked program assignments'
  ) THEN
    CREATE POLICY "Assigned clients can view workout exercises via linked program assignments"
    ON public.workout_exercises
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.workouts w
        WHERE w.id = workout_exercises.workout_id
          AND EXISTS (
            SELECT 1
            FROM public.program_workouts pwr
            LEFT JOIN public.program_phases pp ON pp.id = pwr.phase_id
            LEFT JOIN public.program_weeks pw ON pw.id = pwr.week_id
            WHERE pwr.workout_id = w.id
              AND public.is_client_assigned_to_program(COALESCE(pp.program_id, pw.program_id), auth.uid())
          )
      )
    );
  END IF;
END $$;