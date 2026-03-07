-- Performance indexes for nutrition compliance queries
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_client_date ON nutrition_logs(client_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_logged_at ON nutrition_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_client ON nutrition_targets(client_id);