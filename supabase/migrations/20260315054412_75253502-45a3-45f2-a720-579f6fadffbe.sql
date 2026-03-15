
-- ═══ RECOMMENDATION 1: food_synonyms table ═══
CREATE TABLE IF NOT EXISTS food_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  synonym TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term, synonym)
);

CREATE INDEX IF NOT EXISTS food_synonyms_term_idx ON food_synonyms(lower(term));

ALTER TABLE food_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_synonyms_read_all"
  ON food_synonyms FOR SELECT
  TO authenticated
  USING (true);

-- Seed synonyms
INSERT INTO food_synonyms (term, synonym) VALUES
  ('kirkland', 'costco'), ('kirkland', 'kirkland signature'),
  ('costco', 'kirkland'), ('costco', 'kirkland signature'),
  ('kirkland signature', 'kirkland'), ('kirkland signature', 'costco'),
  ('ground beef', 'hamburger meat'), ('ground beef', 'minced beef'), ('ground beef', 'hamburger'),
  ('hamburger meat', 'ground beef'), ('minced beef', 'ground beef'),
  ('chicken breast', 'chicken breasts'), ('chicken breast', 'boneless chicken'),
  ('chicken breasts', 'chicken breast'), ('boneless chicken', 'chicken breast'),
  ('greek yogurt', 'plain yogurt'), ('greek yogurt', 'strained yogurt'),
  ('oatmeal', 'rolled oats'), ('oatmeal', 'oats'), ('rolled oats', 'oatmeal'),
  ('sweet potato', 'yam'), ('yam', 'sweet potato'),
  ('deli turkey', 'turkey breast'), ('turkey breast', 'deli turkey'),
  ('peanut butter', 'nut butter'), ('almond butter', 'nut butter'),
  ('olive oil', 'extra virgin olive oil'), ('extra virgin olive oil', 'olive oil'),
  ('whole egg', 'egg'), ('egg white', 'egg whites'), ('egg whites', 'egg white'),
  ('skim milk', 'non-fat milk'), ('non-fat milk', 'skim milk'),
  ('low fat milk', '1% milk'), ('whole milk', 'full fat milk'),
  ('cottage cheese', 'low fat cottage cheese'),
  ('tuna', 'canned tuna'), ('canned tuna', 'tuna'),
  ('salmon', 'atlantic salmon'),
  ('protein powder', 'whey protein'), ('whey protein', 'protein powder'),
  ('casein', 'casein protein'),
  ('premier protein', 'protein shake'), ('quest bar', 'protein bar'), ('protein bar', 'quest bar'),
  ('brown rice', 'long grain brown rice'),
  ('white rice', 'jasmine rice'), ('jasmine rice', 'white rice')
ON CONFLICT (term, synonym) DO NOTHING;

-- ═══ RECOMMENDATION 2: user_food_history table ═══
CREATE TABLE IF NOT EXISTS user_food_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id TEXT NOT NULL,
  log_count INTEGER NOT NULL DEFAULT 1,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  last_logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, food_id)
);

CREATE INDEX IF NOT EXISTS user_food_history_user_idx ON user_food_history(user_id);
CREATE INDEX IF NOT EXISTS user_food_history_user_food_idx ON user_food_history(user_id, food_id);
CREATE INDEX IF NOT EXISTS user_food_history_last_logged_idx ON user_food_history(user_id, last_logged_at DESC);

ALTER TABLE user_food_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_food_history_own_data"
  ON user_food_history
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ═══ RECOMMENDATION 3: Alter food_search_log ═══
ALTER TABLE food_search_log ADD COLUMN IF NOT EXISTS normalized_query TEXT;
ALTER TABLE food_search_log ADD COLUMN IF NOT EXISTS best_match_count INTEGER DEFAULT 0;
ALTER TABLE food_search_log ADD COLUMN IF NOT EXISTS clicked_food_id TEXT;
ALTER TABLE food_search_log ADD COLUMN IF NOT EXISTS search_strategy TEXT;
ALTER TABLE food_search_log ADD COLUMN IF NOT EXISTS detected_brand TEXT;

CREATE INDEX IF NOT EXISTS food_search_log_norm_query_idx ON food_search_log(lower(normalized_query));
CREATE INDEX IF NOT EXISTS food_search_log_zero_results_idx ON food_search_log(results_count) WHERE results_count = 0;
CREATE INDEX IF NOT EXISTS food_search_log_created_idx ON food_search_log(created_at DESC);

-- ═══ DB FUNCTIONS ═══

-- Synonym lookup
CREATE OR REPLACE FUNCTION get_synonyms_for_query(input_query TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tokens TEXT[];
  token TEXT;
  synonym_list TEXT[];
  all_terms TEXT[];
BEGIN
  tokens := string_to_array(lower(trim(input_query)), ' ');
  all_terms := tokens;

  FOREACH token IN ARRAY tokens LOOP
    SELECT array_agg(synonym) INTO synonym_list
    FROM food_synonyms WHERE lower(term) = lower(token);
    IF synonym_list IS NOT NULL THEN
      all_terms := all_terms || synonym_list;
    END IF;
  END LOOP;

  SELECT array_agg(synonym) INTO synonym_list
  FROM food_synonyms WHERE lower(term) = lower(input_query);
  IF synonym_list IS NOT NULL THEN
    all_terms := all_terms || synonym_list;
  END IF;

  RETURN ARRAY(SELECT DISTINCT unnest(all_terms));
END;
$$;

GRANT EXECUTE ON FUNCTION get_synonyms_for_query TO authenticated;
GRANT EXECUTE ON FUNCTION get_synonyms_for_query TO anon;

-- Log food to history (upsert)
CREATE OR REPLACE FUNCTION log_food_to_history(p_user_id UUID, p_food_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO user_food_history (user_id, food_id, log_count, last_logged_at)
  VALUES (p_user_id, p_food_id, 1, now())
  ON CONFLICT (user_id, food_id) DO UPDATE SET
    log_count = user_food_history.log_count + 1,
    last_logged_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION log_food_to_history TO authenticated;

-- Toggle favorite
CREATE OR REPLACE FUNCTION toggle_food_favorite(p_user_id UUID, p_food_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  INSERT INTO user_food_history (user_id, food_id, is_favorite)
  VALUES (p_user_id, p_food_id, true)
  ON CONFLICT (user_id, food_id) DO UPDATE SET
    is_favorite = NOT user_food_history.is_favorite
  RETURNING is_favorite INTO new_state;
  RETURN new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_food_favorite TO authenticated;

-- Zero result searches view
CREATE OR REPLACE VIEW zero_result_searches AS
SELECT
  lower(normalized_query) AS query,
  COUNT(*) AS search_count,
  COUNT(DISTINCT user_id) AS unique_users,
  MAX(created_at) AS last_searched_at
FROM food_search_log
WHERE results_count = 0
  AND normalized_query IS NOT NULL
  AND length(normalized_query) >= 3
GROUP BY lower(normalized_query)
ORDER BY search_count DESC;

GRANT SELECT ON zero_result_searches TO authenticated;
