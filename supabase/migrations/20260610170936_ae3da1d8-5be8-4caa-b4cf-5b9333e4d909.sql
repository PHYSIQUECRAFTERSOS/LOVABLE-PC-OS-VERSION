ALTER TABLE public.body_measurements
  ADD COLUMN IF NOT EXISTS shoulders numeric,
  ADD COLUMN IF NOT EXISTS forearm numeric;