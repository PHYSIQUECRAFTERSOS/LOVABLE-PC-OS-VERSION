-- Add session tracking columns to workout_sessions
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS total_volume numeric,
  ADD COLUMN IF NOT EXISTS sets_completed int,
  ADD COLUMN IF NOT EXISTS pr_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- Update existing rows to have status 'completed'
UPDATE public.workout_sessions SET status = 'completed' WHERE completed_at IS NOT NULL;