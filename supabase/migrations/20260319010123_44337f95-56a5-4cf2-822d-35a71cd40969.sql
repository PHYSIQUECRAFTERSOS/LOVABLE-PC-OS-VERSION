ALTER TABLE public.meal_plan_items ADD COLUMN IF NOT EXISTS serving_unit text DEFAULT 'g';
ALTER TABLE public.meal_plan_items ADD COLUMN IF NOT EXISTS serving_size numeric DEFAULT 100;