-- Tighten legacy reusable master workout tables: staff-only visibility,
-- manager/admin management, clients remain assigned-workout only.

DROP POLICY IF EXISTS "Authenticated users can view master workouts" ON public.master_workouts;
DROP POLICY IF EXISTS "Authenticated users can view master workout exercises" ON public.master_workout_exercises;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'master_workouts'
      AND policyname = 'Staff can view master workouts'
  ) THEN
    CREATE POLICY "Staff can view master workouts"
    ON public.master_workouts
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'master_workouts'
      AND policyname = 'Managers can manage all master workouts'
  ) THEN
    CREATE POLICY "Managers can manage all master workouts"
    ON public.master_workouts
    FOR ALL
    TO authenticated
    USING (public.can_manage_shared_master_library(auth.uid()))
    WITH CHECK (public.can_manage_shared_master_library(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'master_workout_exercises'
      AND policyname = 'Staff can view master workout exercises'
  ) THEN
    CREATE POLICY "Staff can view master workout exercises"
    ON public.master_workout_exercises
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'master_workout_exercises'
      AND policyname = 'Managers can manage all master workout exercises'
  ) THEN
    CREATE POLICY "Managers can manage all master workout exercises"
    ON public.master_workout_exercises
    FOR ALL
    TO authenticated
    USING (public.can_manage_shared_master_library(auth.uid()))
    WITH CHECK (public.can_manage_shared_master_library(auth.uid()));
  END IF;
END $$;