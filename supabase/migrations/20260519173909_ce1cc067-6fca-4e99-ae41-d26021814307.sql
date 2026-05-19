ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'dark'
  CHECK (theme_preference IN ('light','dark'));