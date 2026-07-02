CREATE POLICY "Managers can create import jobs"
ON public.ai_import_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can create workouts"
ON public.workouts
FOR INSERT
TO authenticated
WITH CHECK (
  coach_id = auth.uid()
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can view shared master workouts"
ON public.workouts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.program_workouts pw
    LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
    JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id
      AND p.is_master = true
      AND p.is_template = true
  )
);

CREATE POLICY "Managers can update own workouts"
ON public.workouts
FOR UPDATE
TO authenticated
USING (
  coach_id = auth.uid()
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  coach_id = auth.uid()
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can delete own workouts"
ON public.workouts
FOR DELETE
TO authenticated
USING (
  coach_id = auth.uid()
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can manage own workout exercises"
ON public.workout_exercises
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = workout_exercises.workout_id
      AND w.coach_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = workout_exercises.workout_id
      AND w.coach_id = auth.uid()
  )
);

CREATE POLICY "Managers can view shared master workout exercises"
ON public.workout_exercises
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.program_workouts pw
    LEFT JOIN public.program_phases pp ON pp.id = pw.phase_id
    LEFT JOIN public.program_weeks pwk ON pwk.id = pw.week_id
    JOIN public.programs p ON p.id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workout_exercises.workout_id
      AND p.is_master = true
      AND p.is_template = true
  )
);

CREATE POLICY "Managers can create exercises"
ON public.exercises
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "Managers can update exercises"
ON public.exercises
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "Managers can delete exercises"
ON public.exercises
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "Managers can view shared master programs"
ON public.programs
FOR SELECT
TO authenticated
USING (
  is_master = true
  AND is_template = true
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can view shared master program phases"
ON public.program_phases
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.programs p
    WHERE p.id = program_phases.program_id
      AND p.is_master = true
      AND p.is_template = true
  )
);

CREATE POLICY "Managers can view shared master program workouts"
ON public.program_workouts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND (
    (
      phase_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.program_phases pp
        JOIN public.programs p ON p.id = pp.program_id
        WHERE pp.id = program_workouts.phase_id
          AND p.is_master = true
          AND p.is_template = true
      )
    )
    OR
    (
      week_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.program_weeks pw
        JOIN public.programs p ON p.id = pw.program_id
        WHERE pw.id = program_workouts.week_id
          AND p.is_master = true
          AND p.is_template = true
      )
    )
  )
);

CREATE POLICY "Managers can view template meal plans"
ON public.meal_plans
FOR SELECT
TO authenticated
USING (
  is_template = true
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can view template meal plan days"
ON public.meal_plan_days
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.meal_plans mp
    WHERE mp.id = meal_plan_days.meal_plan_id
      AND mp.is_template = true
  )
);

CREATE POLICY "Managers can view template meal plan items"
ON public.meal_plan_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
      AND mp.is_template = true
  )
);

CREATE POLICY "Managers can view shared master supplements"
ON public.master_supplements
FOR SELECT
TO authenticated
USING (
  is_master = true
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can view shared supplement plans"
ON public.supplement_plans
FOR SELECT
TO authenticated
USING (
  is_master = true
  AND public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Managers can view shared supplement plan items"
ON public.supplement_plan_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.supplement_plans sp
    WHERE sp.id = supplement_plan_items.plan_id
      AND sp.is_master = true
  )
);