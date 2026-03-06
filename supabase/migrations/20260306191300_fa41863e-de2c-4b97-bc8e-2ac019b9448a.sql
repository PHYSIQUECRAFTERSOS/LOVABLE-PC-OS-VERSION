
-- Cache table for OFF search results (24hr TTL)
CREATE TABLE IF NOT EXISTS food_search_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_key   text UNIQUE NOT NULL,
  results     jsonb NOT NULL DEFAULT '[]',
  result_count int NOT NULL DEFAULT 0,
  cached_at   timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_food_search_cache_query
  ON food_search_cache(query_key);
CREATE INDEX IF NOT EXISTS idx_food_search_cache_expires
  ON food_search_cache(expires_at);

ALTER TABLE food_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read food_search_cache"
  ON food_search_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth write food_search_cache"
  ON food_search_cache FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth update food_search_cache"
  ON food_search_cache FOR UPDATE TO authenticated USING (true);
