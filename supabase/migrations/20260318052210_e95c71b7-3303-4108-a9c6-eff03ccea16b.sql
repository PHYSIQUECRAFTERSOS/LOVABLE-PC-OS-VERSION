-- Backfill existing saved_meal_items: derive per-100g from stored macros and quantity
UPDATE public.saved_meal_items
SET 
  serving_size_g = CASE WHEN serving_unit = 'g' THEN GREATEST(quantity, 1) ELSE GREATEST(quantity, 1) END,
  calories_per_100g = CASE WHEN quantity > 0 THEN (calories / GREATEST(quantity, 1)) * 100 ELSE calories END,
  protein_per_100g = CASE WHEN quantity > 0 THEN (protein / GREATEST(quantity, 1)) * 100 ELSE protein END,
  carbs_per_100g = CASE WHEN quantity > 0 THEN (carbs / GREATEST(quantity, 1)) * 100 ELSE carbs END,
  fat_per_100g = CASE WHEN quantity > 0 THEN (fat / GREATEST(quantity, 1)) * 100 ELSE fat END
WHERE calories_per_100g = 0 OR calories_per_100g IS NULL;