
-- Add barcode column to food_items
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS barcode text;
CREATE INDEX IF NOT EXISTS idx_food_items_barcode ON public.food_items(barcode) WHERE barcode IS NOT NULL;

-- Meal plan days (Training Day, Rest Day, Refeed, etc.)
CREATE TABLE public.meal_plan_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL DEFAULT 'Training Day',
  day_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plan_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage meal plan days"
  ON public.meal_plan_days FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.meal_plans mp
    WHERE mp.id = meal_plan_days.meal_plan_id
    AND (mp.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Clients can view assigned meal plan days"
  ON public.meal_plan_days FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meal_plans mp
    WHERE mp.id = meal_plan_days.meal_plan_id
    AND mp.client_id = auth.uid()
  ));

-- Add day_id, meal_name, gram_amount to meal_plan_items
ALTER TABLE public.meal_plan_items
  ADD COLUMN IF NOT EXISTS day_id UUID REFERENCES public.meal_plan_days(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS meal_name TEXT NOT NULL DEFAULT 'Meal 1',
  ADD COLUMN IF NOT EXISTS gram_amount NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS meal_order INTEGER NOT NULL DEFAULT 0;

-- Recipes table
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_weight_g NUMERIC NOT NULL DEFAULT 0,
  calories_per_100g NUMERIC NOT NULL DEFAULT 0,
  protein_per_100g NUMERIC NOT NULL DEFAULT 0,
  carbs_per_100g NUMERIC NOT NULL DEFAULT 0,
  fat_per_100g NUMERIC NOT NULL DEFAULT 0,
  fiber_per_100g NUMERIC DEFAULT 0,
  sugar_per_100g NUMERIC DEFAULT 0,
  created_by UUID NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage own recipes"
  ON public.recipes FOR ALL
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone authenticated can view public recipes"
  ON public.recipes FOR SELECT
  USING (is_public = true);

-- Recipe ingredients
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  food_item_id UUID NOT NULL REFERENCES public.food_items(id),
  gram_amount NUMERIC NOT NULL DEFAULT 100,
  ingredient_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipe ingredient access follows recipe access"
  ON public.recipe_ingredients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Public recipe ingredients viewable"
  ON public.recipe_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_ingredients.recipe_id AND r.is_public = true
  ));

-- Add flexibility_mode to meal_plans
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS flexibility_mode BOOLEAN NOT NULL DEFAULT false;

-- Trigger for recipe updated_at
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
