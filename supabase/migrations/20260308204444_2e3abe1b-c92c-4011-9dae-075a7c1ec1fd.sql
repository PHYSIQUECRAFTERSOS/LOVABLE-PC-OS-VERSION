
-- Add unique constraint for upsert on exercise_logs
CREATE UNIQUE INDEX IF NOT EXISTS exercise_logs_session_exercise_set_uniq 
  ON exercise_logs(session_id, exercise_id, set_number);

-- Add logged_at column for tracking when each set was persisted
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ DEFAULT now();
