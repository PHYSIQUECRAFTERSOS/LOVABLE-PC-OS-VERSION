
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS category text DEFAULT null;
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS target_calories integer DEFAULT null;
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS target_protein integer DEFAULT null;
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS target_carbs integer DEFAULT null;
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS target_fat integer DEFAULT null;

CREATE INDEX IF NOT EXISTS idx_meal_plans_is_template ON public.meal_plans(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_meal_plans_coach_category ON public.meal_plans(coach_id, category) WHERE is_template = true;
