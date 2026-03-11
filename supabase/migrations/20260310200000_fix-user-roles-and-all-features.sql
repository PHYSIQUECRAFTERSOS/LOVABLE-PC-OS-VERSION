-- ============================================================
-- Fix 1: Assign admin role to all existing users without a role
-- This is the root cause of all feature failures (calendar, programs,
-- PC recipes, exercise saving) — the user_roles table was empty.
-- ============================================================
DO $$
BEGIN
  -- Create profiles for any users that don't have one yet
  INSERT INTO public.profiles (user_id, full_name)
  SELECT id, COALESCE(raw_user_meta_data->>'full_name', '')
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM public.profiles)
  ON CONFLICT (user_id) DO NOTHING;

  -- Assign admin to all users who have no role yet.
  -- Since user_roles is empty, the first-registered user (app owner) needs admin.
  -- Future signups get 'client' via the handle_new_user trigger (already fixed).
  INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin'::public.app_role
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM public.user_roles)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- Fix 2: Calendar events — allow ALL authenticated users to insert
-- their own events (not just coaches). This ensures coaches with
-- any role + non-coach users can schedule personal events.
-- ============================================================
DROP POLICY IF EXISTS "Coaches can insert events for clients" ON public.calendar_events;
CREATE POLICY "Authenticated users can insert own events"
ON public.calendar_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- Keep the coach-manages-client-events policy for coach scheduling client events
DROP POLICY IF EXISTS "Coaches can manage events for clients" ON public.calendar_events;
CREATE POLICY "Coaches can manage events for clients"
ON public.calendar_events
FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR (
    (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    AND (
      target_client_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.coach_clients
        WHERE coach_clients.coach_id = auth.uid()
        AND coach_clients.client_id = calendar_events.target_client_id
      )
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR (
    (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    AND (
      target_client_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.coach_clients
        WHERE coach_clients.coach_id = auth.uid()
        AND coach_clients.client_id = calendar_events.target_client_id
      )
    )
  )
);

-- ============================================================
-- Fix 3: program_phases and program_workouts — allow owner
-- to manage WITHOUT requiring coach role in user_roles.
-- Uses prog.coach_id = auth.uid() directly.
-- ============================================================

-- Drop all existing program_phases policies and recreate cleanly
DROP POLICY IF EXISTS "Coaches manage their program phases" ON public.program_phases;
DROP POLICY IF EXISTS "Coaches can manage program phases" ON public.program_phases;
DROP POLICY IF EXISTS "Coaches can insert phases for their programs" ON public.program_phases;
DROP POLICY IF EXISTS "Coaches can update phases for their programs" ON public.program_phases;
DROP POLICY IF EXISTS "Coaches can delete phases for their programs" ON public.program_phases;
DROP POLICY IF EXISTS "Users can view program phases" ON public.program_phases;
DROP POLICY IF EXISTS "Program phase access" ON public.program_phases;

CREATE POLICY "Program phase access"
ON public.program_phases FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
    AND (
      p.coach_id = auth.uid()
      OR p.client_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
    AND (
      p.coach_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  )
);

-- Drop all existing program_workouts policies and recreate cleanly
DROP POLICY IF EXISTS "Coaches can manage program workouts" ON public.program_workouts;
DROP POLICY IF EXISTS "Users can view program workouts" ON public.program_workouts;
DROP POLICY IF EXISTS "Program workout access" ON public.program_workouts;

CREATE POLICY "Program workout access"
ON public.program_workouts FOR ALL TO authenticated
USING (
  (
    week_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
  OR
  (
    phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_phases pp
      JOIN public.programs p ON p.id = pp.program_id
      WHERE pp.id = program_workouts.phase_id
      AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
)
WITH CHECK (
  (
    week_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
  OR
  (
    phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.program_phases pp
      JOIN public.programs p ON p.id = pp.program_id
      WHERE pp.id = program_workouts.phase_id
      AND (p.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
);

-- ============================================================
-- Fix 4: exercises — ensure INSERT works for all authenticated users
-- and SELECT works for everyone (already set but re-confirm).
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view exercises" ON public.exercises;
CREATE POLICY "Anyone can view exercises"
ON public.exercises FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create exercises" ON public.exercises;
CREATE POLICY "Authenticated users can create exercises"
ON public.exercises FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Fix 5: nutrition_logs — ensure SELECT + INSERT works by client_id
-- ============================================================
DROP POLICY IF EXISTS "Clients can manage own logs" ON public.nutrition_logs;
CREATE POLICY "Clients can manage own logs"
ON public.nutrition_logs FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- Also allow coaches/admins to view their clients' logs
DROP POLICY IF EXISTS "Coaches can view client nutrition logs" ON public.nutrition_logs;
CREATE POLICY "Coaches can view client nutrition logs"
ON public.nutrition_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  OR client_id = auth.uid()
);

-- ============================================================
-- Fix 6: saved_meals — explicit WITH CHECK
-- ============================================================
DROP POLICY IF EXISTS "Clients manage own saved meals" ON public.saved_meals;
DROP POLICY IF EXISTS "clients_own_saved_meals" ON public.saved_meals;
CREATE POLICY "clients_own_saved_meals"
ON public.saved_meals FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- ============================================================
-- Fix 7: pc_recipes — allow admins to manage (since admin != coach
-- in has_role check but we already handle OR admin). Just ensure
-- created_by = auth.uid() is also allowed for INSERT.
-- ============================================================
DROP POLICY IF EXISTS "Coaches and admins can insert pc_recipes" ON public.pc_recipes;
CREATE POLICY "Coaches and admins can insert pc_recipes"
ON public.pc_recipes FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "Coaches and admins can update pc_recipes" ON public.pc_recipes;
CREATE POLICY "Coaches and admins can update pc_recipes"
ON public.pc_recipes FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coaches and admins can delete pc_recipes" ON public.pc_recipes;
CREATE POLICY "Coaches and admins can delete pc_recipes"
ON public.pc_recipes FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "All authenticated can read published pc_recipes" ON public.pc_recipes;
CREATE POLICY "All authenticated can read published pc_recipes"
ON public.pc_recipes FOR SELECT TO authenticated
USING (is_published = true OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Fix 8: pc_recipe_instructions and pc_recipe_ingredients — follow recipe access
-- ============================================================
DROP POLICY IF EXISTS "All authenticated can read pc_recipe_instructions" ON public.pc_recipe_instructions;
CREATE POLICY "All authenticated can read pc_recipe_instructions"
ON public.pc_recipe_instructions FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Coaches and admins can manage pc_recipe_instructions" ON public.pc_recipe_instructions;
CREATE POLICY "Coaches and admins can manage pc_recipe_instructions"
ON public.pc_recipe_instructions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pc_recipes r
    WHERE r.id = pc_recipe_instructions.recipe_id
    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pc_recipes r
    WHERE r.id = pc_recipe_instructions.recipe_id
    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- pc_recipe_ingredients (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pc_recipe_ingredients') THEN
    EXECUTE 'DROP POLICY IF EXISTS "All authenticated can read pc_recipe_ingredients" ON public.pc_recipe_ingredients';
    EXECUTE 'CREATE POLICY "All authenticated can read pc_recipe_ingredients"
      ON public.pc_recipe_ingredients FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches and admins can manage pc_recipe_ingredients" ON public.pc_recipe_ingredients';
    EXECUTE 'CREATE POLICY "Coaches and admins can manage pc_recipe_ingredients"
      ON public.pc_recipe_ingredients FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.pc_recipes r WHERE r.id = pc_recipe_ingredients.recipe_id AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), ''admin''))))
      WITH CHECK (EXISTS (SELECT 1 FROM public.pc_recipes r WHERE r.id = pc_recipe_ingredients.recipe_id AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), ''admin''))))';
  END IF;
END $$;
