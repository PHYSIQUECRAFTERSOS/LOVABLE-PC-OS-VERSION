CREATE OR REPLACE FUNCTION public.save_meal_with_items(
  p_name TEXT,
  p_meal_type TEXT,
  p_calories NUMERIC,
  p_protein NUMERIC,
  p_carbs NUMERIC,
  p_fat NUMERIC,
  p_servings NUMERIC DEFAULT 1,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID := auth.uid();
  v_meal_id UUID;
  v_item_count INTEGER;
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to save a meal.' USING ERRCODE = '28000';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Meal name is required.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Meal items must be an array.' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_array_length(p_items) INTO v_item_count;
  IF COALESCE(v_item_count, 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one food before saving a meal.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.saved_meals (
    client_id,
    name,
    meal_type,
    calories,
    protein,
    carbs,
    fat,
    servings
  ) VALUES (
    v_client_id,
    trim(p_name),
    COALESCE(NULLIF(trim(p_meal_type), ''), 'snack'),
    COALESCE(p_calories, 0),
    COALESCE(p_protein, 0),
    COALESCE(p_carbs, 0),
    COALESCE(p_fat, 0),
    COALESCE(p_servings, 1)
  )
  RETURNING id INTO v_meal_id;

  INSERT INTO public.saved_meal_items (
    saved_meal_id,
    food_item_id,
    food_name,
    quantity,
    serving_unit,
    serving_size_g,
    calories,
    protein,
    carbs,
    fat,
    calories_per_100g,
    protein_per_100g,
    carbs_per_100g,
    fat_per_100g
  )
  SELECT
    v_meal_id,
    NULLIF(item.food_item_id, '')::UUID,
    COALESCE(NULLIF(trim(item.food_name), ''), 'Food'),
    COALESCE(item.quantity, 1),
    COALESCE(NULLIF(trim(item.serving_unit), ''), 'serving'),
    item.serving_size_g,
    COALESCE(item.calories, 0),
    COALESCE(item.protein, 0),
    COALESCE(item.carbs, 0),
    COALESCE(item.fat, 0),
    COALESCE(item.calories_per_100g, 0),
    COALESCE(item.protein_per_100g, 0),
    COALESCE(item.carbs_per_100g, 0),
    COALESCE(item.fat_per_100g, 0)
  FROM jsonb_to_recordset(p_items) AS item(
    food_item_id TEXT,
    food_name TEXT,
    quantity NUMERIC,
    serving_unit TEXT,
    serving_size_g NUMERIC,
    calories NUMERIC,
    protein NUMERIC,
    carbs NUMERIC,
    fat NUMERIC,
    calories_per_100g NUMERIC,
    protein_per_100g NUMERIC,
    carbs_per_100g NUMERIC,
    fat_per_100g NUMERIC
  );

  RETURN v_meal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_meal_with_items(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB) TO authenticated;