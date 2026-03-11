-- ============================================================
-- Fix role assignment and feature access
-- Root cause: handle_new_user assigns 'client' to everyone,
-- blocking coach/admin features for the app owner.
-- ============================================================

-- 1. Fix handle_new_user: first signup → admin, rest → client
--    This ensures the app owner (first to sign up) gets full access.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;

  -- First user to ever sign up becomes admin (the app owner).
  -- Everyone else is a client by default (can be promoted later).
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'client';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2. Fix exercises INSERT: allow all authenticated users to save exercises.
--    Coaches run small personal platforms — any logged-in user should be
--    able to add to the exercise library.
DROP POLICY IF EXISTS "Coaches and admins can create exercises" ON public.exercises;
CREATE POLICY "Authenticated users can create exercises"
ON public.exercises FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Keep the UPDATE/DELETE restricted to the creator or coach/admin
DROP POLICY IF EXISTS "Coaches can update exercises" ON public.exercises;
CREATE POLICY "Coaches can update exercises"
ON public.exercises FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'coach'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Fix saved_meals: remove the old duplicate policy that lacked WITH CHECK.
--    Keep only the one with explicit WITH CHECK (client_id = auth.uid()).
DROP POLICY IF EXISTS "Clients can manage own saved meals" ON public.saved_meals;
-- "Clients manage own saved meals" already has WITH CHECK — keep it.

-- 4. Ensure recipe_ingredients INSERT works for the recipe creator.
--    Existing ALL policy uses USING as WITH CHECK (works). Add explicit WITH CHECK.
DROP POLICY IF EXISTS "Recipe ingredient access follows recipe access" ON public.recipe_ingredients;
CREATE POLICY "Recipe ingredient access follows recipe access"
ON public.recipe_ingredients FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- 5. Ensure recipes INSERT has explicit WITH CHECK for creator.
DROP POLICY IF EXISTS "Creators can manage own recipes" ON public.recipes;
CREATE POLICY "Creators can manage own recipes"
ON public.recipes FOR ALL TO authenticated
USING (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'coach'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'coach'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 6. Ensure nutrition_logs INSERT works for clients logging food.
--    (Already fixed in prior migration, but enforce WITH CHECK explicitly.)
DROP POLICY IF EXISTS "Clients can manage own logs" ON public.nutrition_logs;
CREATE POLICY "Clients can manage own logs"
ON public.nutrition_logs FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- 7. Ensure client_custom_foods INSERT is open to all authenticated users.
DROP POLICY IF EXISTS "clients_own_custom_foods" ON public.client_custom_foods;
CREATE POLICY "clients_own_custom_foods"
ON public.client_custom_foods FOR ALL TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());
