
ALTER TABLE public.nutrition_targets
  ADD COLUMN IF NOT EXISTS rest_calories INTEGER,
  ADD COLUMN IF NOT EXISTS rest_protein NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS rest_carbs NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS rest_fat NUMERIC(6,1);

COMMENT ON COLUMN public.nutrition_targets.rest_calories IS 'Coach-set calorie target for non-workout days. NULL means use training day target.';
COMMENT ON COLUMN public.nutrition_targets.rest_protein IS 'Coach-set protein target (g) for non-workout days. NULL means use training day target.';
COMMENT ON COLUMN public.nutrition_targets.rest_carbs IS 'Coach-set carbs target (g) for non-workout days. NULL means use training day target.';
COMMENT ON COLUMN public.nutrition_targets.rest_fat IS 'Coach-set fat target (g) for non-workout days. NULL means use training day target.';
