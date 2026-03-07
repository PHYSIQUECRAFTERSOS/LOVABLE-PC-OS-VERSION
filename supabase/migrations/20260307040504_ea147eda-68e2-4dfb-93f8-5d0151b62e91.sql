
-- Add indexes for performance (some already exist, IF NOT EXISTS handles gracefully)
CREATE INDEX IF NOT EXISTS idx_client_invites_invited_by ON client_invites(assigned_coach_id);
CREATE INDEX IF NOT EXISTS idx_client_invites_tier_name ON client_invites(tier_name);
