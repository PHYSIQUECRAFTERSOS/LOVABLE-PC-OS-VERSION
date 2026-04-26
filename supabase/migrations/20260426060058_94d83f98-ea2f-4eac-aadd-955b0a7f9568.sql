CREATE OR REPLACE FUNCTION public.repair_saved_meals_commit(p_run_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_repaired INT := 0;
  v_deleted INT := 0;
  v_meal_ids UUID[] := ARRAY[]::UUID[];
  v_distinct_meals UUID[];
  rec RECORD;
  v_meal UUID;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Apply repairs
  FOR rec IN
    SELECT * FROM saved_meal_repair_audit
    WHERE run_id = p_run_id
      AND mode = 'dry_run'
      AND action = 'repair'
      AND status = 'proposed'
      AND COALESCE(back_calc_agreement_pct, 0) >= 95
  LOOP
    UPDATE saved_meal_items
    SET quantity = rec.proposed_amount,
        serving_unit = rec.proposed_unit
    WHERE id = rec.meal_item_id;

    UPDATE saved_meal_repair_audit
    SET status = 'committed', mode = 'commit', applied_at = now()
    WHERE id = rec.id;

    v_meal_ids := array_append(v_meal_ids, rec.meal_id);
    v_repaired := v_repaired + 1;
  END LOOP;

  -- Apply deletions
  FOR rec IN
    SELECT * FROM saved_meal_repair_audit
    WHERE run_id = p_run_id
      AND mode = 'dry_run'
      AND action = 'delete'
      AND status = 'proposed_delete'
  LOOP
    DELETE FROM saved_meal_items WHERE id = rec.meal_item_id;

    UPDATE saved_meal_repair_audit
    SET status = 'committed', mode = 'commit', applied_at = now()
    WHERE id = rec.id;

    v_meal_ids := array_append(v_meal_ids, rec.meal_id);
    v_deleted := v_deleted + 1;
  END LOOP;

  -- Recompute parent totals for every affected meal (distinct)
  v_distinct_meals := ARRAY(SELECT DISTINCT unnest(v_meal_ids));
  IF array_length(v_distinct_meals, 1) IS NOT NULL THEN
    FOREACH v_meal IN ARRAY v_distinct_meals
    LOOP
      UPDATE saved_meals sm
      SET calories = COALESCE(t.cal, 0),
          protein  = COALESCE(t.pro, 0),
          carbs    = COALESCE(t.carb, 0),
          fat      = COALESCE(t.fat, 0)
      FROM (
        SELECT
          ROUND(SUM(calories))::numeric AS cal,
          ROUND(SUM(protein))::numeric AS pro,
          ROUND(SUM(carbs))::numeric AS carb,
          ROUND(SUM(fat))::numeric AS fat
        FROM saved_meal_items
        WHERE saved_meal_id = v_meal
      ) t
      WHERE sm.id = v_meal;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'repaired', v_repaired,
    'deleted', v_deleted,
    'meals_recomputed', COALESCE(array_length(v_distinct_meals, 1), 0)
  );
END;
$$;