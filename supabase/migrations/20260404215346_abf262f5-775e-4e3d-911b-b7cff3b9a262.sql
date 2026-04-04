-- =============================================
-- STEP 1: Clean up workout_exercises policies
-- Drop the legacy policy (exact name with trailing space)
-- =============================================
DROP POLICY IF EXISTS "Assigned clients can view workout exercises via linked program " ON public.workout_exercises;

-- The two good policies remain:
-- "Owner can view workout exercises" (direct owner/coach/admin)
-- "Program clients can view workout exercises" (via helper function)

-- =============================================
-- STEP 2: Fix workouts SELECT policies
-- The old "Coaches can view their workouts" has an inline
-- phase-only join that misses week-based programs.
-- Replace with a clean policy using the helper function.
-- =============================================
DROP POLICY IF EXISTS "Coaches can view their workouts" ON public.workouts;

CREATE POLICY "Coaches can view their workouts"
  ON public.workouts FOR SELECT
  USING (
    coach_id = auth.uid()
    OR client_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM program_workouts pw
      LEFT JOIN program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN program_weeks pwk ON pwk.id = pw.week_id
      WHERE pw.workout_id = workouts.id
        AND is_client_assigned_to_program(
          COALESCE(pp.program_id, pwk.program_id),
          auth.uid()
        )
    )
  );