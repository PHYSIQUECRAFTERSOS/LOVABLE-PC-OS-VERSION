-- Performance indexes for food search
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm ON foods USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foods_data_quality ON foods(data_quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_foods_popularity ON foods(popularity_score DESC NULLS LAST);

-- Nutrition logs performance
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_client_date ON nutrition_logs(client_id, logged_at);