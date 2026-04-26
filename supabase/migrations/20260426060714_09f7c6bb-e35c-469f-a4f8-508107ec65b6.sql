
-- Deferred constraint trigger: a saved_meal must have at least one child item by COMMIT time.
-- This blocks empty meals at the database layer, no matter what client code does.

CREATE OR REPLACE FUNCTION public.enforce_saved_meal_has_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Only check for rows that still exist (skip if parent was rolled back / deleted in same tx)
  IF NOT EXISTS (SELECT 1 FROM public.saved_meals WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.saved_meal_items
  WHERE saved_meal_id = NEW.id;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'saved_meals row % has zero items at commit time. Empty meals are not allowed.', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_saved_meal_has_items ON public.saved_meals;

CREATE CONSTRAINT TRIGGER trg_enforce_saved_meal_has_items
  AFTER INSERT ON public.saved_meals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_saved_meal_has_items();

-- Admin RPC to list existing empty saved meals (for the cleanup UI)
CREATE OR REPLACE FUNCTION public.list_empty_saved_meals()
RETURNS TABLE(
  id UUID,
  name TEXT,
  client_id UUID,
  meal_type TEXT,
  calories NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  created_at TIMESTAMPTZ,
  client_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT sm.id,
         sm.name,
         sm.client_id,
         sm.meal_type,
         sm.calories,
         sm.protein,
         sm.carbs,
         sm.fat,
         sm.created_at,
         COALESCE(p.full_name, '(unknown)')::TEXT AS client_name
  FROM public.saved_meals sm
  LEFT JOIN public.profiles p ON p.user_id = sm.client_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.saved_meal_items smi WHERE smi.saved_meal_id = sm.id
  )
  ORDER BY sm.created_at DESC;
END;
$$;

-- Admin RPC to delete one empty saved meal (safety: re-checks emptiness)
CREATE OR REPLACE FUNCTION public.admin_delete_empty_saved_meal(p_meal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.saved_meal_items WHERE saved_meal_id = p_meal_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Refusing to delete: meal % has % items. Not empty.', p_meal_id, v_count;
  END IF;

  DELETE FROM public.saved_meals WHERE id = p_meal_id;

  RETURN json_build_object('deleted', p_meal_id);
END;
$$;
