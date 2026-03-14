
## Deep-dive findings (root cause)
1. **Primary failure is reliability, not only ranking**  
   The `search-foods` backend function is throwing `TimeoutError: Signal timed out` during external API parsing. When that happens, the whole request returns an error instead of partial results.

2. **Client fallback is too weak**  
   In `AddFoodScreen`, when edge search fails, fallback queries `food_items` (small table) using a strict full-phrase `ILIKE` (`%kirkland chicken breast%`).  
   This misses brand+food searches where words are split/reordered across name/brand.

3. **Brand intent logic is incomplete**
   - Local cache query in `search-foods` also uses strict full-phrase matching only.
   - Early cache short-circuit returns unsorted local items before brand-relevance scoring.
   - No synonym handling for **Costco ↔ Kirkland**, so “costco chicken breast” won’t reliably surface Kirkland top matches.

---

## Implementation plan

### 1) Harden `search-foods` so it never hard-fails on timeout
**File:** `supabase/functions/search-foods/index.ts`

- Wrap each external source (USDA/OFF + JSON parsing) in isolated try/catch.
- Return **partial results** when one source fails (never fail whole search for timeout).
- Keep local cache results as guaranteed baseline.
- Add structured logging per source (`ok/timeout/error`) for future debugging.
- Remove failure mode where timeout in one source causes empty result experience.

### 2) Rebuild candidate retrieval for brand+food queries
**File:** `supabase/functions/search-foods/index.ts`

- Replace strict phrase-only local search with tokenized matching:
  - tokenize query words
  - match across `name` OR `brand` per token
  - include reordered phrases and split brand/name cases
- Add brand alias expansion:
  - searching “costco” expands with “kirkland”
  - searching “kirkland” expands with “costco”
- Keep dedupe, but score all merged results before slicing to `limit`.

### 3) Upgrade ranking so top result behaves like MyFitnessPal
**File:** `supabase/functions/search-foods/index.ts`

- Strong boosts for:
  - exact/near-exact brand match
  - full query coverage across brand+name
  - exact food term coverage (e.g., “chicken breast”, “bagel”)
- Penalties for:
  - generic rows without brand when brand intent is clear
  - partial-only token matches
- Ensure “brand + food” searches place specific branded items first.

### 4) Fix client fallback path in tracker UI
**File:** `src/components/nutrition/AddFoodScreen.tsx`

- Replace fallback from strict `food_items` full-phrase query to robust fallback:
  1. tokenized fallback from `foods` cache table (same matching intent as edge)
  2. then fallback to `food_items` (for user/custom foods)
- Ensure mapped fallback IDs are stable (`id || off_id || usda_fdc_id`) to prevent rendering/key issues and serving-state collisions.
- Keep logging behavior unchanged (no change to add button function).

### 5) Safety pass for related mistakes
**Files:** `src/components/nutrition/AddFoodScreen.tsx`, `supabase/functions/search-foods/index.ts`

- Guard against stale-response race conditions already present with request IDs; preserve this behavior.
- Ensure no UI regression for existing successful searches.
- Keep branded nutrition import flow intact.

---

## Technical details (implementation shape)
- Query normalization: lowercase, trim, collapse whitespace, tokenize.
- Alias map example:
  - `costco -> kirkland`
  - `kirkland -> costco`
- Score components:
  - `brand contains full query`
  - `name contains full query`
  - `all tokens matched across brand+name`
  - `food-term phrase match` (e.g. “chicken breast”)
  - `brand-intent bonus`
  - `generic penalty when brand-intent`
- Resilience model:
  - return 200 with best available results even when upstreams timeout
  - never let one external timeout collapse all results

---

## Verification plan (including iPhone-focused)
1. **Backend validation via direct calls**
   - Run `search-foods` for:
     - `kirkland`
     - `kirkland chicken breast`
     - `costco chicken breast`
     - `costco bagel`
   - Confirm non-empty responses and top result brand/food relevance.

2. **Runtime log validation**
   - Check function logs to confirm no uncaught timeout failures and partial-source behavior works.

3. **Mobile UI validation (iPhone viewport)**
   - Test in narrow viewport with keyboard open.
   - Confirm searches return visible top branded rows immediately.
   - Confirm add flow still logs correctly (no behavior change).

4. **Regression checks**
   - Generic searches still work.
   - My Meals / PC Recipes tabs unaffected.
   - No duplicate/undefined-key rendering errors in search results.
