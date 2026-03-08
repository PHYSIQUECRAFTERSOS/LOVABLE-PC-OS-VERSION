
-- Bug 1: Backfill target_client_id on calendar_events where it's NULL
-- These events were created with user_id = client_id, so set target_client_id = user_id
UPDATE calendar_events
SET target_client_id = user_id
WHERE target_client_id IS NULL;

-- Bug 2: Remove duplicate nutrition_targets rows per client per effective_date
-- Keep only the most recently created row
DELETE FROM nutrition_targets
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id, effective_date) id
  FROM nutrition_targets
  ORDER BY client_id, effective_date, created_at DESC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE nutrition_targets
  ADD CONSTRAINT unique_nutrition_targets_per_client_date UNIQUE (client_id, effective_date);
