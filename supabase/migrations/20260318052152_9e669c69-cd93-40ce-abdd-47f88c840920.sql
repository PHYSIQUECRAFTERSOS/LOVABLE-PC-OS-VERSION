ALTER TABLE public.saved_meal_items
  ADD COLUMN IF NOT EXISTS serving_size_g numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS calories_per_100g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protein_per_100g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs_per_100g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat_per_100g numeric DEFAULT 0;