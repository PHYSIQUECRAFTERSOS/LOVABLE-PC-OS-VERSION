ALTER TABLE public.coach_clients
  ADD COLUMN IF NOT EXISTS calendar_lookahead_days INTEGER NOT NULL DEFAULT 14;