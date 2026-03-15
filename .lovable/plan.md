

# Food Search Enhancements — Synonyms, History Boost, Analytics, Zero-Result Widening, Debounce

## Summary

Five enhancements to bring food search to MyFitnessPal-quality UX. The project already has `food_search_log`, `user_recent_foods`, `coach_favorite_foods`, and `coach_recent_foods` tables — we will build on top of these rather than creating redundant tables.

## Database Changes (Single Migration)

### 1. `food_synonyms` table — NEW
- Columns: `id`, `term`, `synonym`, `created_at`, `UNIQUE(term, synonym)`
- Index on `lower(term)`
- RLS: SELECT for authenticated, INSERT/UPDATE/DELETE admin-only at app layer
- Seed ~45 synonym pairs (brand aliases, common food equivalents)

### 2. `food_search_log` table — ALTER
- Add columns: `normalized_query TEXT`, `best_match_count INT DEFAULT 0`, `clicked_food_id UUID`, `search_strategy TEXT`, `detected_brand TEXT`
- Add indexes on `normalized_query`, `result_count WHERE result_count = 0`, `created_at DESC`

### 3. `user_food_history` table — NEW
- Columns: `id`, `user_id` (FK auth.users), `food_id` (FK foods), `log_count INT DEFAULT 1`, `is_favorite BOOLEAN DEFAULT false`, `last_logged_at TIMESTAMPTZ`, `first_logged_at TIMESTAMPTZ`, `UNIQUE(user_id, food_id)`
- Indexes on `user_id`, `(user_id, food_id)`, `(user_id, last_logged_at DESC)`
- RLS: ALL for authenticated WHERE `user_id = auth.uid()`

### 4. Database Functions — NEW
- `get_synonyms_for_query(input_query TEXT) RETURNS TEXT[]` — looks up synonyms for each token + the full phrase
- `log_food_to_history(p_user_id UUID, p_food_id UUID) RETURNS void` — upsert into `user_food_history`
- `toggle_food_favorite(p_user_id UUID, p_food_id UUID) RETURNS BOOLEAN` — toggle is_favorite
- `zero_result_searches` VIEW — aggregates zero-result queries for admin review

## Edge Function Changes — `search-foods/index.ts`

### Synonym expansion
- After parsing tokens, call `get_synonyms_for_query` RPC to get expanded terms
- Add synonym terms to the local query OR conditions and external API queries
- Add +15 scoring bonus for synonym matches

### User history boost
- If `user_id` provided, fetch `user_food_history` (limit 500) into a Map
- After scoring, apply boost: favorites +15, log_count * 0.5 (capped at +10), recency factor * 5 (decays over 60 days)
- Re-sort after boosting

### Enhanced analytics logging
- Update the fire-and-forget log to include `normalized_query`, `best_match_count`, `search_strategy`, `detected_brand`

### Zero-result widening
- If primary search returns 0 results, cascade through: food-tokens-only → longest single token → brand-only
- Return `wasWidened`, `usedQuery`, `strategy` in response

### Response shape update
```
{ foods, bestMatches, moreResults, wasWidened, usedQuery, strategy, source }
```

## Frontend Changes — `AddFoodScreen.tsx`

### Debounce
- Create `src/hooks/useDebounce.ts` hook (simple useState + useEffect + setTimeout pattern, 300ms)
- Already has 300ms debounce via `debounceRef` — will keep this pattern but clean it up

### Skeleton loaders
- Add a `FoodResultSkeleton` component (5 animated placeholder rows)
- Show during search instead of spinner

### Widening notice
- When `wasWidened === true`, show subtle text: "Showing results for '{usedQuery}'"

### Star/Favorite toggle
- Add star icon on each FoodRow (gold when favorited, muted when not)
- Tapping calls `toggle_food_favorite` RPC
- Track favorites state in component

### History boost wiring
- After successful `logFood`, call `log_food_to_history` RPC (fire-and-forget)
- Same for `handleDetailConfirm`

### Zero-result "Add Custom" improvement
- Show clearer empty state with "No exact results" messaging
- "Type at least 2 characters" hint when input length === 1

## Files Changed

| File | Change |
|------|--------|
| New migration SQL | food_synonyms table, user_food_history table, alter food_search_log, 3 functions, 1 view |
| `supabase/functions/search-foods/index.ts` | Synonym expansion, history boost, widening cascade, enhanced logging |
| `src/hooks/useDebounce.ts` | NEW — simple debounce hook |
| `src/components/nutrition/AddFoodScreen.tsx` | Skeleton loader, widening notice, favorite star, history boost wiring, min-char hint |

## What is NOT touched
- No food data deleted or modified
- No training/calendar/workout/messaging logic
- No RLS policy changes on existing tables
- Barcode scanner unchanged
- FoodDetailScreen unchanged
- Existing `user_recent_foods`, `coach_favorite_foods`, `coach_recent_foods` tables unchanged

