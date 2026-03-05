
-- Add day_type columns to meal_plans for multi-plan support
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'training',
  ADD COLUMN IF NOT EXISTS day_type_label text NOT NULL DEFAULT 'Training Day',
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- Create index for fast client + day_type lookups
CREATE INDEX IF NOT EXISTS idx_meal_plans_client_day_type 
  ON public.meal_plans (client_id, day_type) 
  WHERE client_id IS NOT NULL AND is_template = false;

-- Create unique partial index: one active plan per client per day_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_unique_client_day_type
  ON public.meal_plans (client_id, day_type) 
  WHERE client_id IS NOT NULL AND is_template = false;
