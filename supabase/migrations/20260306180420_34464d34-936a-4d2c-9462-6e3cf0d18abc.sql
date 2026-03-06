
-- Add category column to food_items
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS category text;

-- Standard BTREE indexes for brand search
CREATE INDEX IF NOT EXISTS idx_food_items_brand ON public.food_items(brand);
CREATE INDEX IF NOT EXISTS idx_food_items_data_source ON public.food_items(data_source);

-- Food cache table for Open Food Facts results
CREATE TABLE IF NOT EXISTS public.food_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_key text NOT NULL,
  source text NOT NULL DEFAULT 'open_food_facts',
  results jsonb NOT NULL,
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS idx_food_cache_query ON public.food_cache(query_key);
CREATE INDEX IF NOT EXISTS idx_food_cache_expires ON public.food_cache(expires_at);

ALTER TABLE public.food_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read food_cache"
ON public.food_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert food_cache"
ON public.food_cache FOR INSERT TO authenticated WITH CHECK (true);

-- User recent foods table
CREATE TABLE IF NOT EXISTS public.user_recent_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  food_id uuid REFERENCES public.food_items(id) ON DELETE SET NULL,
  food_name text,
  food_data jsonb,
  selected_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recent_foods_user ON public.user_recent_foods(user_id, selected_at DESC);

ALTER TABLE public.user_recent_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recent foods"
ON public.user_recent_foods FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- search_foods RPC for brand-first ranking
CREATE OR REPLACE FUNCTION public.search_foods(search_query text, result_limit int DEFAULT 25)
RETURNS TABLE (
  id uuid,
  name text,
  brand text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  serving_size numeric,
  serving_unit text,
  data_source text,
  category text,
  is_verified boolean,
  relevance_score int
) AS $$
DECLARE
  tokens text[];
BEGIN
  tokens := string_to_array(lower(trim(search_query)), ' ');

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.brand,
    f.calories,
    f.protein,
    f.carbs,
    f.fat,
    f.fiber,
    f.sugar,
    f.sodium,
    f.serving_size,
    f.serving_unit,
    f.data_source,
    f.category,
    f.is_verified,
    (
      CASE
        WHEN lower(f.brand) = ANY(tokens) THEN 5
        WHEN f.brand IS NOT NULL AND lower(f.brand) ILIKE ANY(
          SELECT '%' || t || '%' FROM unnest(tokens) t
        ) THEN 4
        WHEN (
          SELECT COUNT(*) FROM unnest(tokens) t
          WHERE lower(f.name) ILIKE '%' || t || '%'
        ) = array_length(tokens, 1) THEN 3
        WHEN lower(f.name) ILIKE '%' || tokens[1] || '%' THEN 2
        ELSE 1
      END
    )::int AS relevance_score
  FROM public.food_items f
  WHERE
    (f.calories > 0 OR f.protein > 0 OR f.carbs > 0 OR f.fat > 0)
    AND (
      lower(f.name) ILIKE ANY(SELECT '%' || t || '%' FROM unnest(tokens) t)
      OR (f.brand IS NOT NULL AND lower(f.brand) ILIKE ANY(SELECT '%' || t || '%' FROM unnest(tokens) t))
    )
  ORDER BY relevance_score DESC, f.is_verified DESC, f.name ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
