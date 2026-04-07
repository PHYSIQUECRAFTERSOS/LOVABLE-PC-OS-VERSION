
ALTER TABLE public.coach_clients
ADD COLUMN IF NOT EXISTS transferred_from uuid DEFAULT NULL;

ALTER TABLE public.coach_clients
ADD COLUMN IF NOT EXISTS transferred_at timestamptz DEFAULT NULL;
