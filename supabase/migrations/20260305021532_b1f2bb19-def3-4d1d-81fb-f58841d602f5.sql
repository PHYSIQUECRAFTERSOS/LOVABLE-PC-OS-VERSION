
-- Add session recovery columns
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- Backfill started_at from created_at for existing rows
UPDATE public.workout_sessions SET started_at = created_at WHERE started_at IS NULL;

-- Index for fast banner lookup on app load
CREATE INDEX IF NOT EXISTS idx_workout_sessions_client_status ON public.workout_sessions (client_id, status);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_workout_sessions_last_heartbeat ON public.workout_sessions (last_heartbeat);
