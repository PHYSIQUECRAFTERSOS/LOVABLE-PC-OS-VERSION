
ALTER TABLE public.client_custom_foods 
  ADD COLUMN IF NOT EXISTS serving_unit text DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sugar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sodium numeric DEFAULT 0;
