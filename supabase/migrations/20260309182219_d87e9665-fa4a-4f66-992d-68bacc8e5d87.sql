
-- saved_meal_items for individual foods within a saved meal
CREATE TABLE IF NOT EXISTS public.saved_meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_meal_id UUID NOT NULL REFERENCES public.saved_meals(id) ON DELETE CASCADE,
  food_item_id UUID REFERENCES public.food_items(id),
  food_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  serving_unit TEXT NOT NULL DEFAULT 'g',
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_meal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own saved meal items"
  ON public.saved_meal_items FOR ALL TO authenticated
  USING (saved_meal_id IN (SELECT id FROM public.saved_meals WHERE client_id = auth.uid()))
  WITH CHECK (saved_meal_id IN (SELECT id FROM public.saved_meals WHERE client_id = auth.uid()));

-- PC Recipes (coach-created, client-readable)
CREATE TABLE IF NOT EXISTS public.pc_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  servings INTEGER NOT NULL DEFAULT 1,
  youtube_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pc_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read published pc_recipes"
  ON public.pc_recipes FOR SELECT TO authenticated
  USING (is_published = true OR public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches and admins can insert pc_recipes"
  ON public.pc_recipes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches and admins can update pc_recipes"
  ON public.pc_recipes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches and admins can delete pc_recipes"
  ON public.pc_recipes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

-- PC Recipe Ingredients
CREATE TABLE IF NOT EXISTS public.pc_recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.pc_recipes(id) ON DELETE CASCADE,
  food_item_id UUID REFERENCES public.food_items(id),
  food_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  serving_unit TEXT NOT NULL DEFAULT 'g',
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.pc_recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read pc_recipe_ingredients"
  ON public.pc_recipe_ingredients FOR SELECT TO authenticated
  USING (recipe_id IN (SELECT id FROM public.pc_recipes WHERE is_published = true OR public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Coaches and admins can manage pc_recipe_ingredients"
  ON public.pc_recipe_ingredients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

-- PC Recipe Instructions
CREATE TABLE IF NOT EXISTS public.pc_recipe_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.pc_recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction_text TEXT NOT NULL
);

ALTER TABLE public.pc_recipe_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read pc_recipe_instructions"
  ON public.pc_recipe_instructions FOR SELECT TO authenticated
  USING (recipe_id IN (SELECT id FROM public.pc_recipes WHERE is_published = true OR public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Coaches and admins can manage pc_recipe_instructions"
  ON public.pc_recipe_instructions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));
