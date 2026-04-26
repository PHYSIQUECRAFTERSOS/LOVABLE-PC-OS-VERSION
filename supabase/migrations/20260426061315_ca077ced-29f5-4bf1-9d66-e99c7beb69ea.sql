-- 1. Add source-tracking columns to nutrition_logs (additive, nullable)
ALTER TABLE public.nutrition_logs
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_saved_meal_id UUID;

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_source_saved_meal
  ON public.nutrition_logs(source_saved_meal_id)
  WHERE source_saved_meal_id IS NOT NULL;

-- 2. Admin: list legacy synthetic single-row meal logs
-- Heuristic: nutrition_logs row with no food_item_id, has custom_name that
-- matches an existing saved_meals.name for the same client.
CREATE OR REPLACE FUNCTION public.list_synthetic_saved_meal_logs()
RETURNS TABLE (
  log_id UUID,
  client_id UUID,
  client_name TEXT,
  meal_name TEXT,
  meal_type TEXT,
  logged_at DATE,
  calories NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  saved_meal_id UUID,
  saved_meal_item_count INT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    nl.id AS log_id,
    nl.client_id,
    COALESCE(p.full_name, '(unknown)')::TEXT AS client_name,
    nl.custom_name AS meal_name,
    nl.meal_type,
    nl.logged_at::DATE AS logged_at,
    nl.calories,
    nl.protein,
    nl.carbs,
    nl.fat,
    sm.id AS saved_meal_id,
    (SELECT COUNT(*)::INT FROM public.saved_meal_items smi WHERE smi.saved_meal_id = sm.id) AS saved_meal_item_count
  FROM public.nutrition_logs nl
  JOIN public.saved_meals sm
    ON sm.client_id = nl.client_id
   AND sm.name = nl.custom_name
  LEFT JOIN public.profiles p ON p.user_id = nl.client_id
  WHERE nl.food_item_id IS NULL
    AND nl.custom_name IS NOT NULL
    AND COALESCE(nl.source, '') <> 'saved_meal'
  ORDER BY nl.logged_at DESC, nl.created_at DESC;
END;
$$;

-- 3. Admin: fan out a single synthetic row into individual food rows
CREATE OR REPLACE FUNCTION public.admin_fan_out_synthetic_log(p_log_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_meal_id UUID;
  v_inserted INT := 0;
  v_item RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT nl.* INTO v_log
  FROM public.nutrition_logs nl
  WHERE nl.id = p_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log row % not found', p_log_id;
  END IF;

  IF v_log.food_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Log row % is not a synthetic meal row (has food_item_id).', p_log_id;
  END IF;

  IF v_log.custom_name IS NULL THEN
    RAISE EXCEPTION 'Log row % has no custom_name to match against saved meals.', p_log_id;
  END IF;

  SELECT id INTO v_meal_id
  FROM public.saved_meals
  WHERE client_id = v_log.client_id
    AND name = v_log.custom_name
  LIMIT 1;

  IF v_meal_id IS NULL THEN
    RAISE EXCEPTION 'No matching saved_meals row for client=% name=%', v_log.client_id, v_log.custom_name;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.saved_meal_items WHERE saved_meal_id = v_meal_id) THEN
    RAISE EXCEPTION 'Saved meal % has no items to fan out.', v_meal_id;
  END IF;

  -- Insert one nutrition_logs row per saved_meal_item, preserving the synthetic row's
  -- log_date and meal_type.
  FOR v_item IN
    SELECT * FROM public.saved_meal_items WHERE saved_meal_id = v_meal_id
  LOOP
    INSERT INTO public.nutrition_logs (
      client_id, food_item_id, custom_name, meal_type, servings,
      quantity_display, quantity_unit,
      calories, protein, carbs, fat,
      logged_at, tz_corrected,
      source, source_saved_meal_id
    ) VALUES (
      v_log.client_id,
      v_item.food_item_id,
      CASE WHEN v_item.food_item_id IS NULL THEN v_item.food_name ELSE NULL END,
      v_log.meal_type,
      1,
      CASE WHEN COALESCE(v_item.serving_unit, 'g') = 'g' THEN v_item.quantity ELSE NULL END,
      CASE WHEN COALESCE(v_item.serving_unit, 'g') = 'g' THEN 'g' ELSE 'serving' END,
      ROUND(COALESCE(v_item.calories, 0)),
      ROUND(COALESCE(v_item.protein, 0)),
      ROUND(COALESCE(v_item.carbs, 0)),
      ROUND(COALESCE(v_item.fat, 0)),
      v_log.logged_at,
      true,
      'saved_meal',
      v_meal_id
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- Delete the original synthetic row only after children are inserted
  DELETE FROM public.nutrition_logs WHERE id = p_log_id;

  RETURN json_build_object(
    'log_id', p_log_id,
    'saved_meal_id', v_meal_id,
    'rows_inserted', v_inserted
  );
END;
$$;