
-- Add placement series columns to ranked_profiles
ALTER TABLE ranked_profiles
  ADD COLUMN IF NOT EXISTS placement_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS placement_start_date date,
  ADD COLUMN IF NOT EXISTS placement_days_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS placement_score jsonb;

-- All EXISTING profiles are already ranked, so they stay 'completed'.
-- New profiles will be created with placement_status = 'pending' via code.
-- We set default to 'completed' so existing rows aren't affected.

COMMENT ON COLUMN ranked_profiles.placement_status IS 'pending | in_progress | completed | coach_override';
COMMENT ON COLUMN ranked_profiles.placement_score IS 'JSON with workout_pct, nutrition_pct, cardio_pct, overall, final_xp';
