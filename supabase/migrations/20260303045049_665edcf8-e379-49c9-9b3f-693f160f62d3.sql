
-- Add last-seen tracking and manual unread flag to message_threads
ALTER TABLE public.message_threads 
  ADD COLUMN IF NOT EXISTS coach_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_marked_unread boolean NOT NULL DEFAULT false;

-- Initialize coach_last_seen_at for existing threads to now (so no false unread)
UPDATE public.message_threads SET coach_last_seen_at = now() WHERE coach_last_seen_at IS NULL;
