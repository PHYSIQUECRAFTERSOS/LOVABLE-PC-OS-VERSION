
-- Add is_master column to supplement_plans
ALTER TABLE supplement_plans ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;

-- Add is_master column to master_supplements
ALTER TABLE master_supplements ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;

-- Coaches can SELECT shared supplement plans (is_master = true)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Coaches can view shared supplement plans' AND tablename = 'supplement_plans'
  ) THEN
    CREATE POLICY "Coaches can view shared supplement plans"
    ON supplement_plans FOR SELECT TO authenticated
    USING (
      is_master = true
      AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    );
  END IF;
END $$;

-- Coaches can SELECT shared master supplements
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Coaches can view shared master supplements' AND tablename = 'master_supplements'
  ) THEN
    CREATE POLICY "Coaches can view shared master supplements"
    ON master_supplements FOR SELECT TO authenticated
    USING (
      is_master = true
      AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    );
  END IF;
END $$;

-- Coaches can view items of shared plans
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Coaches can view shared plan items' AND tablename = 'supplement_plan_items'
  ) THEN
    CREATE POLICY "Coaches can view shared plan items"
    ON supplement_plan_items FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM supplement_plans sp
        WHERE sp.id = supplement_plan_items.plan_id
        AND sp.is_master = true
        AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
      )
    );
  END IF;
END $$;
