
-- Add daily_step_goal to nutrition_targets
ALTER TABLE nutrition_targets
  ADD COLUMN IF NOT EXISTS daily_step_goal INTEGER DEFAULT 10000;

-- Backfill existing rows
UPDATE nutrition_targets SET daily_step_goal = 10000 WHERE daily_step_goal IS NULL;

-- Use a validation trigger instead of CHECK constraint (per guidelines)
CREATE OR REPLACE FUNCTION validate_step_goal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.daily_step_goal IS NOT NULL AND (NEW.daily_step_goal < 1000 OR NEW.daily_step_goal > 100000) THEN
    RAISE EXCEPTION 'daily_step_goal must be between 1000 and 100000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_step_goal
  BEFORE INSERT OR UPDATE ON nutrition_targets
  FOR EACH ROW EXECUTE FUNCTION validate_step_goal();
