
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS had_unlogged_sets BOOLEAN DEFAULT false;
