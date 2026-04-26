-- =========================================================================
-- Phase 3: My Meals portion corruption — audit + dry-run + commit
-- =========================================================================

-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.saved_meal_repair_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_by UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'commit')),
  action TEXT NOT NULL CHECK (action IN ('repair', 'delete')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'proposed_delete', 'committed', 'skipped_ambiguous', 'skipped_already_correct')),

  -- Identifiers
  meal_id UUID NOT NULL,
  meal_item_id UUID NOT NULL,
  user_id UUID,
  food_id UUID,
  food_name TEXT,

  -- Original payload (for reversibility)
  original_amount NUMERIC,
  original_unit TEXT,
  original_calories NUMERIC,
  original_protein_g NUMERIC,
  original_carbs_g NUMERIC,
  original_fat_g NUMERIC,
  original_serving_size_g NUMERIC,
  original_calories_per_100g NUMERIC,
  original_protein_per_100g NUMERIC,
  original_carbs_per_100g NUMERIC,
  original_fat_per_100g NUMERIC,

  -- Proposed values (only for repair rows)
  proposed_amount NUMERIC,
  proposed_unit TEXT,
  back_calc_agreement_pct NUMERIC,

  applied_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_smra_run_id ON public.saved_meal_repair_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_smra_status ON public.saved_meal_repair_audit(status);

ALTER TABLE public.saved_meal_repair_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit" ON public.saved_meal_repair_audit;
CREATE POLICY "Admins can read audit"
  ON public.saved_meal_repair_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can write audit" ON public.saved_meal_repair_audit;
CREATE POLICY "Admins can write audit"
  ON public.saved_meal_repair_audit
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- =========================================================================
-- 2. Dry-run function
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repair_saved_meals_dry_run()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  v_caller UUID := auth.uid();
  v_repair_count INT := 0;
  v_delete_count INT := 0;
  v_already_correct INT := 0;
  v_ambiguous INT := 0;
  rec RECORD;
  v_food_cal_per_g NUMERIC;
  v_food_pro_per_g NUMERIC;
  v_food_carb_per_g NUMERIC;
  v_food_fat_per_g NUMERIC;
  v_real_g_cal NUMERIC;
  v_real_g_pro NUMERIC;
  v_real_g_carb NUMERIC;
  v_real_g_fat NUMERIC;
  v_avg NUMERIC;
  v_max_dev NUMERIC;
  v_agreement NUMERIC;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  FOR rec IN
    SELECT smi.*, sm.client_id AS meal_owner,
           fi.serving_size AS fi_serving, fi.calories AS fi_cal,
           fi.protein AS fi_pro, fi.carbs AS fi_carb, fi.fat AS fi_fat
    FROM saved_meal_items smi
    JOIN saved_meals sm ON sm.id = smi.saved_meal_id
    LEFT JOIN food_items fi ON fi.id = smi.food_item_id
    WHERE smi.serving_unit = 'g'
      AND smi.quantity = 1
      AND COALESCE(smi.calories, 0) > 9
  LOOP
    -- Resolve per-gram reference: prefer cached calories_per_100g, fall back to food_items
    v_food_cal_per_g := NULL;
    IF COALESCE(rec.calories_per_100g, 0) > 0 THEN
      v_food_cal_per_g := rec.calories_per_100g / 100.0;
      v_food_pro_per_g := COALESCE(rec.protein_per_100g, 0) / 100.0;
      v_food_carb_per_g := COALESCE(rec.carbs_per_100g, 0) / 100.0;
      v_food_fat_per_g := COALESCE(rec.fat_per_100g, 0) / 100.0;
    ELSIF rec.fi_serving IS NOT NULL AND rec.fi_serving > 0 AND COALESCE(rec.fi_cal, 0) > 0 THEN
      v_food_cal_per_g := rec.fi_cal / rec.fi_serving;
      v_food_pro_per_g := COALESCE(rec.fi_pro, 0) / rec.fi_serving;
      v_food_carb_per_g := COALESCE(rec.fi_carb, 0) / rec.fi_serving;
      v_food_fat_per_g := COALESCE(rec.fi_fat, 0) / rec.fi_serving;
    END IF;

    IF v_food_cal_per_g IS NULL OR v_food_cal_per_g = 0 THEN
      -- Unrecoverable: no reference data — stage for deletion
      INSERT INTO saved_meal_repair_audit (
        run_id, run_by, mode, action, status,
        meal_id, meal_item_id, user_id, food_id, food_name,
        original_amount, original_unit,
        original_calories, original_protein_g, original_carbs_g, original_fat_g,
        original_serving_size_g, original_calories_per_100g, original_protein_per_100g,
        original_carbs_per_100g, original_fat_per_100g,
        notes
      ) VALUES (
        v_run_id, v_caller, 'dry_run', 'delete', 'proposed_delete',
        rec.saved_meal_id, rec.id, rec.meal_owner, rec.food_item_id, rec.food_name,
        rec.quantity, rec.serving_unit,
        rec.calories, rec.protein, rec.carbs, rec.fat,
        rec.serving_size_g, rec.calories_per_100g, rec.protein_per_100g,
        rec.carbs_per_100g, rec.fat_per_100g,
        'No per-100g or food_items reference data — auto-delete approved'
      );
      v_delete_count := v_delete_count + 1;
      CONTINUE;
    END IF;

    -- Check if macros actually match 1g (i.e. coach-set; not corrupted)
    IF ABS(rec.calories - v_food_cal_per_g) <= GREATEST(v_food_cal_per_g * 0.05, 1) THEN
      INSERT INTO saved_meal_repair_audit (
        run_id, run_by, mode, action, status,
        meal_id, meal_item_id, user_id, food_id, food_name,
        original_amount, original_unit,
        original_calories, original_protein_g, original_carbs_g, original_fat_g,
        original_serving_size_g, original_calories_per_100g,
        original_protein_per_100g, original_carbs_per_100g, original_fat_per_100g,
        notes
      ) VALUES (
        v_run_id, v_caller, 'dry_run', 'repair', 'skipped_already_correct',
        rec.saved_meal_id, rec.id, rec.meal_owner, rec.food_item_id, rec.food_name,
        rec.quantity, rec.serving_unit,
        rec.calories, rec.protein, rec.carbs, rec.fat,
        rec.serving_size_g, rec.calories_per_100g,
        rec.protein_per_100g, rec.carbs_per_100g, rec.fat_per_100g,
        'Macros match 1g — coach intent preserved'
      );
      v_already_correct := v_already_correct + 1;
      CONTINUE;
    END IF;

    -- Back-calculate from each macro
    v_real_g_cal := rec.calories / v_food_cal_per_g;
    v_real_g_pro := CASE WHEN v_food_pro_per_g > 0 THEN rec.protein / v_food_pro_per_g ELSE NULL END;
    v_real_g_carb := CASE WHEN v_food_carb_per_g > 0 THEN rec.carbs / v_food_carb_per_g ELSE NULL END;
    v_real_g_fat := CASE WHEN v_food_fat_per_g > 0 THEN rec.fat / v_food_fat_per_g ELSE NULL END;

    -- Average of available back-calcs
    v_avg := (
      COALESCE(v_real_g_cal, 0)
      + COALESCE(v_real_g_pro, 0)
      + COALESCE(v_real_g_carb, 0)
      + COALESCE(v_real_g_fat, 0)
    ) / NULLIF(
      (CASE WHEN v_real_g_cal IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN v_real_g_pro IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN v_real_g_carb IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN v_real_g_fat IS NOT NULL THEN 1 ELSE 0 END), 0);

    -- Max deviation from average across the back-calcs (in pct)
    v_max_dev := GREATEST(
      COALESCE(ABS(v_real_g_cal - v_avg) / NULLIF(v_avg, 0), 0),
      COALESCE(ABS(v_real_g_pro - v_avg) / NULLIF(v_avg, 0), 0),
      COALESCE(ABS(v_real_g_carb - v_avg) / NULLIF(v_avg, 0), 0),
      COALESCE(ABS(v_real_g_fat - v_avg) / NULLIF(v_avg, 0), 0)
    );
    v_agreement := ROUND((1 - v_max_dev) * 100, 2);

    IF v_agreement >= 95 THEN
      INSERT INTO saved_meal_repair_audit (
        run_id, run_by, mode, action, status,
        meal_id, meal_item_id, user_id, food_id, food_name,
        original_amount, original_unit,
        original_calories, original_protein_g, original_carbs_g, original_fat_g,
        original_serving_size_g, original_calories_per_100g,
        original_protein_per_100g, original_carbs_per_100g, original_fat_per_100g,
        proposed_amount, proposed_unit, back_calc_agreement_pct
      ) VALUES (
        v_run_id, v_caller, 'dry_run', 'repair', 'proposed',
        rec.saved_meal_id, rec.id, rec.meal_owner, rec.food_item_id, rec.food_name,
        rec.quantity, rec.serving_unit,
        rec.calories, rec.protein, rec.carbs, rec.fat,
        rec.serving_size_g, rec.calories_per_100g,
        rec.protein_per_100g, rec.carbs_per_100g, rec.fat_per_100g,
        ROUND(v_avg, 1), 'g', v_agreement
      );
      v_repair_count := v_repair_count + 1;
    ELSE
      INSERT INTO saved_meal_repair_audit (
        run_id, run_by, mode, action, status,
        meal_id, meal_item_id, user_id, food_id, food_name,
        original_amount, original_unit,
        original_calories, original_protein_g, original_carbs_g, original_fat_g,
        original_serving_size_g, original_calories_per_100g,
        original_protein_per_100g, original_carbs_per_100g, original_fat_per_100g,
        proposed_amount, proposed_unit, back_calc_agreement_pct,
        notes
      ) VALUES (
        v_run_id, v_caller, 'dry_run', 'repair', 'skipped_ambiguous',
        rec.saved_meal_id, rec.id, rec.meal_owner, rec.food_item_id, rec.food_name,
        rec.quantity, rec.serving_unit,
        rec.calories, rec.protein, rec.carbs, rec.fat,
        rec.serving_size_g, rec.calories_per_100g,
        rec.protein_per_100g, rec.carbs_per_100g, rec.fat_per_100g,
        ROUND(v_avg, 1), 'g', v_agreement,
        'Back-calc agreement < 95% — manual review required'
      );
      v_ambiguous := v_ambiguous + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'run_id', v_run_id,
    'repairs_proposed', v_repair_count,
    'deletions_proposed', v_delete_count,
    'already_correct', v_already_correct,
    'ambiguous', v_ambiguous
  );
END;
$$;


-- =========================================================================
-- 3. Commit function — applies a specific dry-run plan in a single tx
-- =========================================================================
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
  v_meal_ids UUID[];
  rec RECORD;
  v_meal UUID;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Apply repairs (status=proposed, action=repair, agreement>=95)
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

  -- Apply deletions (status=proposed_delete)
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

  -- Recompute parent meal totals for every affected meal
  IF v_meal_ids IS NOT NULL THEN
    FOREACH v_meal IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(v_meal_ids)))
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
    'meals_recomputed', COALESCE(array_length(ARRAY(SELECT DISTINCT unnest(v_meal_ids)), 1), 0)
  );
END;
$$;