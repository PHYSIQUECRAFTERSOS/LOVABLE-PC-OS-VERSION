
-- Add exercise_modifications JSONB column to workout_sessions for tracking switches/deletions
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS exercise_modifications JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN workout_sessions.exercise_modifications IS 'Tracks exercise switches and deletions during active sessions. Array of {type, original_exercise_id, original_exercise_name, replacement_exercise_id, replacement_exercise_name, switched_at} or {type, exercise_id, exercise_name, deleted_at}';
