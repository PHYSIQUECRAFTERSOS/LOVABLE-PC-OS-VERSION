

# Fix Food Search Relevance — MFP-Quality Ranking

## Problem Summary

From screenshots, "kirkland bagel" returns O'Doughs and Thomas bagels (no Kirkland), "kirkland cookie" returns Gerble and XXL Nutrition cookies (no Kirkland), and "costco bagels" returns Fitzgeralds bagels. The scoring system was updated but three structural issues remain:

1. **Premature short-circuiting**: The edge function returns cached results too early (5 brand matches → skip external APIs), so actual Kirkland bagels from USDA/OFF never get fetched
2. **Local query is too broad**: OR-matching any token returns too many irrelevant items that dilute results
3. **No result grouping**: All results shown in a flat list instead of MFP-style "Best Match" / "More Results"

## Changes

### 1. Edge Function — `supabase/functions/search-foods/index.ts`

**A) Remove premature short-circuiting for brand+food queries**
- When query has both brand AND food tokens (e.g., "kirkland bagel"), ALWAYS hit external APIs regardless of local cache size
- Only short-circuit for single-word generic queries with 8+ local results

**B) Expand brand aliases to cover more common fitness brands**
- Add: `grenade`, `quest`, `optimum nutrition`, `fairlife`, `fage`, `chobani`, `premier protein`, `rxbar`, `clif`, `kind`, `nature valley`, `dave's killer bread`

**C) Improve local query — require ALL food tokens present**
- After the broad OR query, filter local results to only keep items where ALL food tokens appear in name OR brand (post-query filter)
- This prevents "kirkland bagel" from returning "Kirkland Fruit Punch"

**D) Boost scoring for brand+food compound matches**
- Brand in `brand` field AND all food tokens in `name` → +100 bonus (highest tier)
- Brand alias in `brand` field AND all food tokens → +90
- All tokens covered across name+brand → +70
- Reduce generic brand-only match score to avoid brand-but-wrong-food results dominating

**E) Add result grouping to response**
- Split results into `bestMatches` (score >= threshold where brand+food both match) and `moreResults`
- Return `{ bestMatches, moreResults, foods (flat for backward compat) }`

**F) Increase external API page sizes for brand searches**
- USDA: increase from 20 to 30 for brand queries
- OFF: keep at 50 for brand queries

### 2. Frontend — `src/components/nutrition/AddFoodScreen.tsx`

**A) Consume grouped response**
- Check for `data.bestMatches` / `data.moreResults` in the edge function response
- Fall back to `data.foods` for backward compatibility

**B) Render "Best Match" and "More Results" sections**
- When bestMatches exist, show a "Best Match" header above them
- Show "More Results" header above remaining items
- Keep existing FoodRow component unchanged

### 3. Database — Add trigram indexes (migration)

The `foods` table already has a `search_vector` tsvector column and a trigger `foods_search_vector_update`. Add trigram indexes on `name` and `brand` for better partial matching:

```sql
CREATE INDEX IF NOT EXISTS foods_name_trgm_idx ON foods USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS foods_brand_trgm_idx ON foods USING GIN(brand gin_trgm_ops);
```

pg_trgm extension is already enabled (confirmed from existing functions).

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/search-foods/index.ts` | Fix short-circuiting, expand brands, improve scoring, add grouping |
| `src/components/nutrition/AddFoodScreen.tsx` | Render grouped results with Best Match / More Results headers |
| Database migration | Add trigram indexes on `foods.name` and `foods.brand` |

## What is NOT touched
- No food data deleted or re-imported
- No training/calendar/workout/messaging logic
- No RLS policy changes
- No water tracking
- Barcode scanner unchanged
- FoodDetailScreen unchanged

