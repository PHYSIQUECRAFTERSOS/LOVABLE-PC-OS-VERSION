

# Nutrition Tracker Improvements — No FatSecret

## Current State
The system already uses Local DB + OpenFoodFacts + USDA in parallel. FatSecret is NOT used in any active search or barcode flow — only an unused proxy edge function exists. No changes needed to remove it.

## Plan

### 1. Search Relevance — Branded & Restaurant Foods

**File: `supabase/functions/search-foods/index.ts`**

- **Expand brand dictionary** with ~40 restaurant chains (Dominos, McDonald's, Chick-fil-A, Chipotle, Subway, Starbucks, Wendy's, Taco Bell, Panda Express, Five Guys, Pizza Hut, Burger King, KFC, Popeyes, Dunkin, Tim Hortons, etc.) and ~20 more grocery brands (Thomas', Sara Lee, Pepperidge Farm, Nature's Own, Dave's Killer Bread, etc.)
- **Add phrase match bonus** (+50) when the full food phrase (e.g. "everything bagel", "brooklyn pizza") appears as a contiguous substring in the food name — currently tokens are scored independently which hurts multi-word food queries
- **Improve OFF query for branded searches**: when brand intent is detected, fire a second OFF request filtered by brand tag (`&tagtype_0=brands&tag_contains_0=contains&tag_0=dominos`) in parallel with the generic query
- **Always fire external APIs**: remove the short-circuit at line 351 that skips OFF/USDA when local has >= 8 results for non-brand queries — this causes stale results. Instead, always run all sources in parallel

### 2. Search Speed (sub-3 seconds)

- Reduce external API timeouts from 5s to 3s
- Run local DB query, synonym expansion, and history fetch all in parallel (currently synonyms block before external APIs)
- Reduce client-side debounce from 300ms to 200ms in `src/hooks/useFoodSearch.ts`

### 3. Barcode Scanner Verification

**File: `supabase/functions/barcode-lookup/index.ts`** — already uses Local → OFF → USDA chain (no FatSecret). Verify it still works correctly with current `foods` table schema. No structural changes needed.

**File: `src/components/nutrition/BarcodeScanner.tsx`** — add a visible "Type barcode manually" link during the scanning state (currently only appears after scan failure)

### 4. Boost Previously Used & Favorite Foods

**File: `supabase/functions/search-foods/index.ts`**

- Increase history boost values: favorites from +15 to +40, per-log from +0.5 to +1.5 (capped at 30), recency from +5 to +15
- Ensure previously logged foods matching the query always appear in "Best Matches"

### Files Modified
1. `supabase/functions/search-foods/index.ts` — brand dictionary, scoring, parallel execution, history boosts
2. `src/hooks/useFoodSearch.ts` — reduce debounce to 200ms
3. `src/components/nutrition/BarcodeScanner.tsx` — show manual barcode entry during scanning

