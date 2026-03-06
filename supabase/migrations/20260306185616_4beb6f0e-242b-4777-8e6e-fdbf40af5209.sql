
-- Rebuild search_foods RPC for food_items table with better multi-word support
DROP FUNCTION IF EXISTS search_foods(text, int);

CREATE OR REPLACE FUNCTION search_foods(
  search_query text,
  result_limit int DEFAULT 25
)
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
  serving_label text,
  category text,
  data_source text,
  is_verified boolean,
  barcode text,
  relevance_score int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tokens text[];
  q text := lower(trim(search_query));
BEGIN
  tokens := string_to_array(q, ' ');

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
    f.serving_label,
    f.category,
    f.data_source,
    f.is_verified,
    f.barcode,
    (
      CASE
        WHEN lower(coalesce(f.brand,'')) = q THEN 100
        WHEN lower(coalesce(f.brand,'')) ILIKE '%' || q || '%' THEN 90
        WHEN similarity(lower(coalesce(f.brand,'')), q) > 0.25 THEN 80
        WHEN array_length(tokens, 1) > 1 AND lower(coalesce(f.brand,'')) ILIKE '%' || tokens[1] || '%' THEN 75
        WHEN lower(f.name) ILIKE '%' || q || '%' THEN 70
        WHEN (
          SELECT COUNT(*) FROM unnest(tokens) t
          WHERE lower(f.name) ILIKE '%' || t || '%'
        ) = array_length(tokens, 1) THEN 60
        WHEN similarity(lower(f.name), q) > 0.2 THEN 50
        WHEN EXISTS (
          SELECT 1 FROM unnest(tokens) t WHERE lower(f.name) ILIKE '%' || t || '%'
        ) THEN 40
        ELSE GREATEST(1, (similarity(lower(f.name), q) * 30)::int)
      END
    )::int AS relevance_score
  FROM food_items f
  WHERE
    (f.calories > 0 OR f.protein > 0 OR f.carbs > 0 OR f.fat > 0)
    AND (
      lower(f.name) ILIKE '%' || q || '%'
      OR lower(coalesce(f.brand,'')) ILIKE '%' || q || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(tokens) t
        WHERE lower(f.name) ILIKE '%' || t || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(tokens) t
        WHERE lower(coalesce(f.brand,'')) ILIKE '%' || t || '%'
      )
      OR similarity(lower(f.name), q) > 0.2
      OR similarity(lower(coalesce(f.brand,'')), q) > 0.2
    )
  ORDER BY relevance_score DESC, f.is_verified DESC, f.name ASC
  LIMIT result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_foods(text, int) TO authenticated;

-- Add trigram indexes on food_items if missing
CREATE INDEX IF NOT EXISTS idx_food_items_name_trgm ON food_items USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_food_items_brand_trgm ON food_items USING gin(coalesce(brand,'') gin_trgm_ops);
