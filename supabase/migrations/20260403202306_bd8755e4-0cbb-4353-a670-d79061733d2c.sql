
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_weight_unit TEXT NOT NULL DEFAULT 'lbs';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_measurement_unit TEXT NOT NULL DEFAULT 'in';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_distance_unit TEXT NOT NULL DEFAULT 'miles';
