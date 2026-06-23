ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.onboarding_profiles ADD COLUMN IF NOT EXISTS date_of_birth date;