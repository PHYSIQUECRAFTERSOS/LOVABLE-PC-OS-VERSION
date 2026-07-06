
-- ============================================================
-- Phase 2 performance migration
-- Rewrap auth.uid() as (select auth.uid()) so PostgreSQL evaluates
-- it once per statement (initplan) instead of once per row.
-- Consolidate redundant workout_exercises ALL policy.
-- Add missing FK index; drop duplicate index.
-- All policies preserve the SAME semantics — only the wrapping changes.
-- ============================================================

-- ------------------- client_program_assignments -------------------
DROP POLICY IF EXISTS "Coach can delete assignments" ON public.client_program_assignments;
CREATE POLICY "Coach can delete assignments" ON public.client_program_assignments
FOR DELETE USING (((select auth.uid()) = coach_id) OR public.has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Coach can manage assignments" ON public.client_program_assignments;
CREATE POLICY "Coach can manage assignments" ON public.client_program_assignments
FOR INSERT WITH CHECK ((select auth.uid()) = coach_id);

DROP POLICY IF EXISTS "Coach can update assignments" ON public.client_program_assignments;
CREATE POLICY "Coach can update assignments" ON public.client_program_assignments
FOR UPDATE USING (((select auth.uid()) = coach_id) OR public.has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Coach and client can view assignments" ON public.client_program_assignments;
CREATE POLICY "Coach and client can view assignments" ON public.client_program_assignments
FOR SELECT USING (
  ((select auth.uid()) = coach_id)
  OR ((select auth.uid()) = client_id)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.client_id = client_program_assignments.client_id
      AND cc.coach_id = (select auth.uid())
      AND cc.status = 'active'
  )
);

-- ------------------- program_phases -------------------
DROP POLICY IF EXISTS "Coaches manage their program phases" ON public.program_phases;
CREATE POLICY "Coaches manage their program phases" ON public.program_phases
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_phases.program_id
    AND (p.coach_id = (select auth.uid()) OR p.client_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_phases.program_id
    AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

DROP POLICY IF EXISTS "Managers manage their program phases" ON public.program_phases;
CREATE POLICY "Managers manage their program phases" ON public.program_phases
FOR ALL TO authenticated
USING (public.has_role((select auth.uid()), 'manager'::app_role) AND EXISTS (
  SELECT 1 FROM public.programs p WHERE p.id = program_phases.program_id AND p.coach_id = (select auth.uid())
))
WITH CHECK (public.has_role((select auth.uid()), 'manager'::app_role) AND EXISTS (
  SELECT 1 FROM public.programs p WHERE p.id = program_phases.program_id AND p.coach_id = (select auth.uid())
));

DROP POLICY IF EXISTS "Assigned clients can view program phases via assignments" ON public.program_phases;
CREATE POLICY "Assigned clients can view program phases via assignments" ON public.program_phases
FOR SELECT TO authenticated
USING (public.is_client_assigned_to_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "Coaches view shared master program phases" ON public.program_phases;
CREATE POLICY "Coaches view shared master program phases" ON public.program_phases
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_phases.program_id AND p.is_master AND p.is_template
    AND (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

DROP POLICY IF EXISTS "Managers can view shared master program phases" ON public.program_phases;
CREATE POLICY "Managers can view shared master program phases" ON public.program_phases
FOR SELECT TO authenticated
USING (public.has_role((select auth.uid()), 'manager'::app_role) AND EXISTS (
  SELECT 1 FROM public.programs p WHERE p.id = program_phases.program_id AND p.is_master AND p.is_template
));

-- ------------------- program_weeks -------------------
DROP POLICY IF EXISTS "Coaches can manage program weeks" ON public.program_weeks;
CREATE POLICY "Coaches can manage program weeks" ON public.program_weeks
FOR ALL USING (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_weeks.program_id
    AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

DROP POLICY IF EXISTS "Assigned clients can view program weeks via assignments" ON public.program_weeks;
CREATE POLICY "Assigned clients can view program weeks via assignments" ON public.program_weeks
FOR SELECT TO authenticated
USING (public.is_client_assigned_to_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "Coaches view shared master program weeks" ON public.program_weeks;
CREATE POLICY "Coaches view shared master program weeks" ON public.program_weeks
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_weeks.program_id AND p.is_master AND p.is_template
    AND (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

DROP POLICY IF EXISTS "Users can view program weeks" ON public.program_weeks;
CREATE POLICY "Users can view program weeks" ON public.program_weeks
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.programs p
  WHERE p.id = program_weeks.program_id
    AND (p.coach_id = (select auth.uid()) OR p.client_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

-- ------------------- program_workouts -------------------
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;
CREATE POLICY "Coaches can manage program workouts" ON public.program_workouts
FOR ALL
USING (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
  OR (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
      AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
)
WITH CHECK (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
  OR (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
      AND (p.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
);

DROP POLICY IF EXISTS "Managers manage program workouts" ON public.program_workouts;
CREATE POLICY "Managers manage program workouts" ON public.program_workouts
FOR ALL TO authenticated
USING (public.has_role((select auth.uid()), 'manager'::app_role) AND (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND p.coach_id = (select auth.uid())
  ))
  OR (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND p.coach_id = (select auth.uid())
  ))
))
WITH CHECK (public.has_role((select auth.uid()), 'manager'::app_role) AND (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND p.coach_id = (select auth.uid())
  ))
  OR (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND p.coach_id = (select auth.uid())
  ))
));

DROP POLICY IF EXISTS "Assigned clients can view program workouts via assignments" ON public.program_workouts;
CREATE POLICY "Assigned clients can view program workouts via assignments" ON public.program_workouts
FOR SELECT TO authenticated
USING (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp
    WHERE pp.id = program_workouts.phase_id AND public.is_client_assigned_to_program(pp.program_id, (select auth.uid()))
  ))
  OR (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw
    WHERE pw.id = program_workouts.week_id AND public.is_client_assigned_to_program(pw.program_id, (select auth.uid()))
  ))
);

DROP POLICY IF EXISTS "Coaches view shared master program workouts" ON public.program_workouts;
CREATE POLICY "Coaches view shared master program workouts" ON public.program_workouts
FOR SELECT USING (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND p.is_master AND p.is_template
      AND (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
  OR (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND p.is_master AND p.is_template
      AND (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
);

DROP POLICY IF EXISTS "Managers can view shared master program workouts" ON public.program_workouts;
CREATE POLICY "Managers can view shared master program workouts" ON public.program_workouts
FOR SELECT TO authenticated
USING (public.has_role((select auth.uid()), 'manager'::app_role) AND (
  (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id AND p.is_master AND p.is_template
  ))
  OR (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id AND p.is_master AND p.is_template
  ))
));

DROP POLICY IF EXISTS "Users can view program workouts" ON public.program_workouts;
CREATE POLICY "Users can view program workouts" ON public.program_workouts
FOR SELECT TO authenticated
USING (
  (week_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_weeks pw JOIN public.programs p ON p.id = pw.program_id
    WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = (select auth.uid()) OR p.client_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
  OR (phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_phases pp JOIN public.programs p ON p.id = pp.program_id
    WHERE pp.id = program_workouts.phase_id
      AND (p.coach_id = (select auth.uid()) OR p.client_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
  ))
);

-- ------------------- workouts -------------------
DROP POLICY IF EXISTS "Coaches can create workouts" ON public.workouts;
CREATE POLICY "Coaches can create workouts" ON public.workouts
FOR INSERT
WITH CHECK (
  coach_id = (select auth.uid())
  AND (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Coaches can update their workouts" ON public.workouts;
CREATE POLICY "Coaches can update their workouts" ON public.workouts
FOR UPDATE
USING (coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers can create workouts" ON public.workouts;
CREATE POLICY "Managers can create workouts" ON public.workouts
FOR INSERT TO authenticated
WITH CHECK (coach_id = (select auth.uid()) AND public.has_role((select auth.uid()), 'manager'::app_role));

DROP POLICY IF EXISTS "Managers can update own workouts" ON public.workouts;
CREATE POLICY "Managers can update own workouts" ON public.workouts
FOR UPDATE TO authenticated
USING (coach_id = (select auth.uid()) AND public.has_role((select auth.uid()), 'manager'::app_role))
WITH CHECK (coach_id = (select auth.uid()) AND public.has_role((select auth.uid()), 'manager'::app_role));

DROP POLICY IF EXISTS "Managers can delete own workouts" ON public.workouts;
CREATE POLICY "Managers can delete own workouts" ON public.workouts
FOR DELETE TO authenticated
USING (coach_id = (select auth.uid()) AND public.has_role((select auth.uid()), 'manager'::app_role));

DROP POLICY IF EXISTS "Coaches view shared master workouts" ON public.workouts;
CREATE POLICY "Coaches view shared master workouts" ON public.workouts
FOR SELECT
USING (
  (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.program_workouts pw
      LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
      JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id AND p.is_master AND p.is_template
  )
);

DROP POLICY IF EXISTS "Managers can view shared master workouts" ON public.workouts;
CREATE POLICY "Managers can view shared master workouts" ON public.workouts
FOR SELECT TO authenticated
USING (
  public.has_role((select auth.uid()), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.program_workouts pw
      LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
      JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id AND p.is_master AND p.is_template
  )
);

DROP POLICY IF EXISTS "workouts_select_all_paths" ON public.workouts;
CREATE POLICY "workouts_select_all_paths" ON public.workouts
FOR SELECT
USING (
  coach_id = (select auth.uid())
  OR client_id = (select auth.uid())
  OR public.has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.program_workouts pw
      LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
      JOIN public.client_program_assignments cpa ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id
      AND cpa.client_id = (select auth.uid())
      AND cpa.status = ANY (ARRAY['active','subscribed'])
  )
);

-- ------------------- workout_exercises -------------------
-- Drop the redundant ALL policy — its SELECT half duplicates workout_exercises_select_all_paths.
-- Replace with explicit INSERT/UPDATE/DELETE only.
DROP POLICY IF EXISTS "Coaches can manage workout exercises" ON public.workout_exercises;

CREATE POLICY "Coaches can insert workout exercises" ON public.workout_exercises
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.id = workout_exercises.workout_id
    AND (w.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

CREATE POLICY "Coaches can update workout exercises" ON public.workout_exercises
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.id = workout_exercises.workout_id
    AND (w.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

CREATE POLICY "Coaches can delete workout exercises" ON public.workout_exercises
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.id = workout_exercises.workout_id
    AND (w.coach_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::app_role))
));

DROP POLICY IF EXISTS "Managers can manage own workout exercises" ON public.workout_exercises;
CREATE POLICY "Managers can manage own workout exercises" ON public.workout_exercises
FOR ALL TO authenticated
USING (public.has_role((select auth.uid()), 'manager'::app_role) AND EXISTS (
  SELECT 1 FROM public.workouts w WHERE w.id = workout_exercises.workout_id AND w.coach_id = (select auth.uid())
))
WITH CHECK (public.has_role((select auth.uid()), 'manager'::app_role) AND EXISTS (
  SELECT 1 FROM public.workouts w WHERE w.id = workout_exercises.workout_id AND w.coach_id = (select auth.uid())
));

DROP POLICY IF EXISTS "Coaches view shared master workout exercises" ON public.workout_exercises;
CREATE POLICY "Coaches view shared master workout exercises" ON public.workout_exercises
FOR SELECT USING (
  (public.has_role((select auth.uid()), 'coach'::app_role) OR public.has_role((select auth.uid()), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.program_workouts pw
      LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
      JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workout_exercises.workout_id AND p.is_master AND p.is_template
  )
);

DROP POLICY IF EXISTS "Managers can view shared master workout exercises" ON public.workout_exercises;
CREATE POLICY "Managers can view shared master workout exercises" ON public.workout_exercises
FOR SELECT TO authenticated
USING (
  public.has_role((select auth.uid()), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.program_workouts pw
      LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
      JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workout_exercises.workout_id AND p.is_master AND p.is_template
  )
);

DROP POLICY IF EXISTS "workout_exercises_select_all_paths" ON public.workout_exercises;
CREATE POLICY "workout_exercises_select_all_paths" ON public.workout_exercises
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.id = workout_exercises.workout_id
    AND (
      w.coach_id = (select auth.uid())
      OR w.client_id = (select auth.uid())
      OR public.has_role((select auth.uid()), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.program_workouts pw
          LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
          LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
          JOIN public.client_program_assignments cpa ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
        WHERE pw.workout_id = w.id
          AND cpa.client_id = (select auth.uid())
          AND cpa.status = ANY (ARRAY['active','subscribed'])
      )
    )
));

-- ------------------- Index cleanup -------------------
-- Add missing FK-supporting index used by useClientProgram
CREATE INDEX IF NOT EXISTS idx_program_weeks_program_id
  ON public.program_weeks (program_id);

-- Drop duplicate program_phases index (idx_program_phases_program_id is identical)
DROP INDEX IF EXISTS public.idx_program_phases_program;
