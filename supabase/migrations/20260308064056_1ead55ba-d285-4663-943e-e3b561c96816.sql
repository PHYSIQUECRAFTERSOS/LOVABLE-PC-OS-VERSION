
ALTER TABLE weight_logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE weight_logs ADD COLUMN IF NOT EXISTS notes TEXT;

-- Backfill onboarding weights for existing clients
INSERT INTO weight_logs (client_id, weight, logged_at, source)
SELECT
  op.user_id,
  op.weight_lb,
  op.created_at::DATE,
  'onboarding'
FROM onboarding_profiles op
WHERE op.weight_lb IS NOT NULL
  AND op.weight_lb > 0
  AND NOT EXISTS (
    SELECT 1 FROM weight_logs wl
    WHERE wl.client_id = op.user_id
  )
ON CONFLICT (client_id, logged_at) DO NOTHING;
