
-- Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_food_items_name_trgm ON food_items USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_food_items_brand_trgm ON food_items USING gin(brand gin_trgm_ops);

-- Add unique constraint for user_recent_foods upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_recent_foods_user_food ON user_recent_foods(user_id, food_id);

-- Add update policy for food_cache
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'food_cache' AND policyname = 'Authenticated users can update food_cache') THEN
    CREATE POLICY "Authenticated users can update food_cache" ON food_cache FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- Replace search_foods with fuzzy matching support
CREATE OR REPLACE FUNCTION public.search_foods(search_query text, result_limit integer DEFAULT 25)
RETURNS TABLE(
  id uuid, name text, brand text, calories numeric, protein numeric,
  carbs numeric, fat numeric, fiber numeric, sugar numeric, sodium numeric,
  serving_size numeric, serving_unit text, data_source text, category text,
  is_verified boolean, relevance_score integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $function$
DECLARE
  tokens text[];
BEGIN
  tokens := string_to_array(lower(trim(search_query)), ' ');

  RETURN QUERY
  SELECT
    f.id, f.name, f.brand, f.calories, f.protein, f.carbs, f.fat,
    f.fiber, f.sugar, f.sodium, f.serving_size, f.serving_unit,
    f.data_source, f.category, f.is_verified,
    (
      CASE
        WHEN lower(coalesce(f.brand, '')) = ANY(tokens) THEN 100
        WHEN similarity(lower(coalesce(f.brand, '')), lower(search_query)) > 0.3 THEN 80
        WHEN f.brand IS NOT NULL AND lower(f.brand) ILIKE ANY(
          SELECT '%' || t || '%' FROM unnest(tokens) t
        ) THEN 70
        WHEN (
          SELECT COUNT(*) FROM unnest(tokens) t
          WHERE lower(f.name) ILIKE '%' || t || '%'
        ) = array_length(tokens, 1) THEN 60
        WHEN similarity(lower(f.name), lower(search_query)) > 0.3 THEN 50
        WHEN lower(f.name) ILIKE '%' || tokens[1] || '%' THEN 40
        ELSE GREATEST(1, (similarity(lower(f.name), lower(search_query)) * 30)::int)
      END
    )::int AS relevance_score
  FROM public.food_items f
  WHERE
    (f.calories > 0 OR f.protein > 0 OR f.carbs > 0 OR f.fat > 0)
    AND (
      lower(f.name) ILIKE ANY(SELECT '%' || t || '%' FROM unnest(tokens) t)
      OR (f.brand IS NOT NULL AND lower(f.brand) ILIKE ANY(SELECT '%' || t || '%' FROM unnest(tokens) t))
      OR similarity(lower(f.name), lower(search_query)) > 0.25
      OR similarity(lower(coalesce(f.brand, '')), lower(search_query)) > 0.25
    )
  ORDER BY relevance_score DESC, f.is_verified DESC, f.name ASC
  LIMIT result_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION search_foods(text, int) TO authenticated;
