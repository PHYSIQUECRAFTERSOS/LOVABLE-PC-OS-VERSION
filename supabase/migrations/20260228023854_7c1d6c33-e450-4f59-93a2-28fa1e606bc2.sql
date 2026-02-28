
-- Add first_name and last_name to staff_invites
ALTER TABLE public.staff_invites
  ADD COLUMN first_name text,
  ADD COLUMN last_name text;

-- Backfill existing rows with empty strings
UPDATE public.staff_invites SET first_name = '' WHERE first_name IS NULL;
UPDATE public.staff_invites SET last_name = '' WHERE last_name IS NULL;
