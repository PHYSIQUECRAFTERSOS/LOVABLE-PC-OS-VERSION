-- Add weight_unit column to exercise_logs to track the unit used when logging
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'lbs';

-- Add a comment explaining the column
COMMENT ON COLUMN exercise_logs.weight_unit IS 'The unit the client used when entering the weight value (lbs or kg). The weight column stores the raw value in this unit.';