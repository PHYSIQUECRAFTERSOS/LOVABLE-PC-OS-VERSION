ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_group_id uuid;

ALTER TABLE public.client_supplement_assignments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP INDEX IF EXISTS public.idx_meal_plans_unique_client_day_type;
CREATE UNIQUE INDEX idx_meal_plans_unique_client_day_type
  ON public.meal_plans (client_id, day_type)
  WHERE client_id IS NOT NULL
    AND is_template = false
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meal_plans_client_archived
  ON public.meal_plans (client_id, archived_at DESC)
  WHERE client_id IS NOT NULL AND archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csa_client_archived
  ON public.client_supplement_assignments (client_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;