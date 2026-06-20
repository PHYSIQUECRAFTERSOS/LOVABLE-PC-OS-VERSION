-- One-time repair: meal_plan_items where the coach picked a natural-unit food
-- (e.g. "unit", "banana") but gram_amount was stored as the UNIT COUNT instead
-- of real grams. Symptom: client app showed "2g" or "0.5g" and macros rounded
-- to ~0. Fix: convert gram_amount to real grams and scale macros accordingly.
UPDATE public.meal_plan_items
SET
  gram_amount = gram_amount * serving_size,
  calories    = COALESCE(calories, 0) * serving_size,
  protein     = COALESCE(protein, 0) * serving_size,
  carbs       = COALESCE(carbs, 0) * serving_size,
  fat         = COALESCE(fat, 0) * serving_size
WHERE serving_unit IS NOT NULL
  AND LOWER(serving_unit) <> 'g'
  AND serving_size IS NOT NULL
  AND serving_size > 0
  AND gram_amount  IS NOT NULL
  AND gram_amount  > 0
  AND gram_amount  < serving_size;