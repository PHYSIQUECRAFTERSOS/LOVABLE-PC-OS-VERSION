
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS fatsecret_id text;

-- Add unique constraint for fatsecret_id (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS foods_fatsecret_id_unique ON public.foods (fatsecret_id) WHERE fatsecret_id IS NOT NULL;

-- Add index on barcode for fast barcode lookups
CREATE INDEX IF NOT EXISTS foods_barcode_lookup_idx ON public.foods (barcode) WHERE barcode IS NOT NULL;
