

# Nutrition System Overhaul: FatSecret Integration + Bug Fixes

## Executive Summary

Replace Open Food Facts as the primary external source with FatSecret API (OAuth 2.0 client credentials flow), fix the 5 active bugs, and restructure the lookup chain to: **Local Supabase cache → FatSecret → USDA fallback**. FatSecret provides faster responses, better barcode coverage (especially Canadian/branded products like Kirkland), and an autocomplete endpoint — solving the speed, accuracy, and barcode bugs simultaneously.

---

## Phase 1: Add FatSecret Secrets + Create Edge Function (Foundation)

### 1A. Store FatSecret credentials as secrets
- Use `add_secret` to store `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET`
- These will be used by the edge function for OAuth 2.0 token exchange

### 1B. Create `fatsecret-proxy` edge function
Single edge function handling three actions: `search`, `barcode`, `autocomplete`

**OAuth 2.0 flow** (server-side only):
```
POST https://oauth.fatsecret.com/connect/token
  grant_type=client_credentials
  scope=basic barcode
  client_id/client_secret via Basic Auth header
→ Returns access_token (cache in memory, ~24h TTL)
```

**Search action**: `POST /rest/server.api` with `method=foods.search.v3&search_expression={query}&max_results=20`
- Map FatSecret response to the existing `foods` table schema (per-100g normalization)
- FatSecret returns per-serving data; convert using `metric_serving_amount` and `metric_serving_unit`

**Barcode action**: `method=food.find_id_for_barcode.v2&barcode={ean13}&include_food_attributes=true`
- Normalize UPC-A (12 digits) to EAN-13 (prepend 0)
- Returns full food data including servings

**Autocomplete action**: `method=foods.autocomplete.v2&expression={query}&max_results=10`
- Returns suggestions in <50ms — use for instant typeahead

### 1C. Config
```toml
[functions.fatsecret-proxy]
verify_jwt = false
```

---

## Phase 2: Rewire `search-foods` Edge Function

### New lookup chain in `search-foods/index.ts`:

```
1. Local Supabase `foods` table (existing, <200ms)
   ↓ if < 8 results for compound/brand queries
2. FatSecret foods.search.v3 (NEW, ~500ms, replaces OFF primary)
   ↓ parallel with
3. USDA FoodData Central (existing, kept as supplement for generic/verified foods)
   ✗ REMOVE: All Open Food Facts search calls (4 sequential calls eliminated)
```

**Key changes to `search-foods/index.ts`**:
- Replace the OFF primary/alias/Canada fetch blocks (lines 512-564) with a single FatSecret call
- Run FatSecret + USDA in parallel via `Promise.allSettled()`
- Add `mapFatSecretFood()` mapper that converts FatSecret's per-serving format to per-100g
- Cache FatSecret results into `foods` table (upsert on a new `fatsecret_id` column)
- Remove the `isEnglishResult()` filter (no longer needed — FatSecret returns region-appropriate results)
- Reduce USDA timeout from 8s → 5s
- Total expected search time: ~1-2s (down from 7-20s)

### FatSecret response mapping
FatSecret returns servings like: `{ metric_serving_amount: 140, metric_serving_unit: "g", calories: 80, protein: 1.0, carbohydrate: 19.2, fat: 0.5 }`

Convert to per-100g:
```
calories_per_100g = (calories / metric_serving_amount) * 100
protein_per_100g = (protein / metric_serving_amount) * 100
...
```

---

## Phase 3: Rewire Barcode Lookup

### New chain in `barcode-lookup/index.ts`:

```
1. Local Supabase `foods` table (check by barcode column)
   ↓ if not found
2. FatSecret food.find_id_for_barcode.v2 (NEW, replaces OFF for barcode)
   ↓ if not found  
3. USDA by GTIN (existing, low priority fallback)
   ✗ REMOVE: Direct OFF barcode call and UPC Item DB call
```

**Also fix**: `BarcodeScanner.tsx` currently calls `lookupBarcode()` from `barcodeService.ts` which does **direct browser-side fetch** to OFF (CORS issues). Change to call `supabase.functions.invoke("barcode-lookup")` instead.

### Barcode normalization
- UPC-A (12 digits): prepend `0` to make EAN-13
- EAN-13 (13 digits): use as-is
- FatSecret requires GTIN-13 format

---

## Phase 4: Fix Active Bugs

### Bug 1 (Missing food name) + Bug 2 ("Couldn't save")

**Root cause confirmed**: `nutrition_logs.food_item_id` has FK constraint to `food_items.id`. When logging an OFF/FatSecret food, `importOFFFood()` tries to insert into `food_items` first. If it fails (duplicate, column mismatch), the returned `null` causes `logFood()` to use the original `item.id` (a UUID from the `foods` cache table, NOT `food_items`), violating the FK constraint → "Couldn't save" error. The name is never written to `custom_name` as fallback.

**Fix in `AddFoodScreen.tsx` `logFood()` function**:
- Always set `custom_name: foodToLog.name` on the INSERT, even when `food_item_id` is provided
- When `importOFFFood` returns null, log with `food_item_id: null` and `custom_name: item.name` instead of silently using the wrong ID
- Surface actual Supabase error in toast: `toast({ title: "Couldn't save", description: error.message })`

**Fix in `DailyNutritionLog.tsx` display**:
- Change display logic to: `item.custom_name || foodNames[item.food_item_id] || "Unknown Food"` (prefer custom_name first since it's always populated)

### Bug 3 (Search speed)
Fixed by Phase 2 — FatSecret replaces 4 sequential OFF calls with 1 parallel call.

### Bug 4 (Branded products wrong results)
Fixed by Phase 2 — FatSecret has strong branded coverage including Kirkland, Great Value, No Name. No language/country filtering needed.

### Bug 5 (Barcode scanning fails)
Fixed by Phase 3 — FatSecret barcode API has excellent coverage for NA consumer products.

---

## Phase 5: Database Migration

### Add `fatsecret_id` column to `foods` table
```sql
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS fatsecret_id text UNIQUE;
CREATE INDEX IF NOT EXISTS foods_fatsecret_id_idx ON public.foods (fatsecret_id) WHERE fatsecret_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS foods_barcode_idx ON public.foods (barcode) WHERE barcode IS NOT NULL;
```

This allows the edge function to upsert FatSecret results for caching, just like USDA/OFF results today.

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/fatsecret-proxy/index.ts` | **NEW** — OAuth 2.0 token exchange + search/barcode/autocomplete proxy |
| `supabase/functions/search-foods/index.ts` | Replace OFF calls with FatSecret, parallelize with USDA |
| `supabase/functions/barcode-lookup/index.ts` | Replace OFF+UPC with local cache → FatSecret → USDA chain |
| `src/components/nutrition/BarcodeScanner.tsx` | Route through edge function instead of direct browser fetch |
| `src/components/nutrition/AddFoodScreen.tsx` | Fix `logFood()` to always set `custom_name`, handle import failure gracefully |
| `src/components/nutrition/DailyNutritionLog.tsx` | Fix display to prefer `custom_name` |
| `src/utils/barcodeService.ts` | Rewrite to call edge function instead of direct OFF fetch |
| `supabase/config.toml` | Add `fatsecret-proxy` function config |
| Migration | Add `fatsecret_id` column + barcode index to `foods` |

---

## Implementation Order

1. Store FatSecret secrets (blocked on user input)
2. DB migration (add `fatsecret_id` column)
3. Create `fatsecret-proxy` edge function
4. Rewire `search-foods` to use FatSecret + parallel USDA
5. Rewire `barcode-lookup` to use FatSecret
6. Fix `BarcodeScanner.tsx` to use edge function
7. Fix `logFood()` / `importOFFFood()` bugs in `AddFoodScreen.tsx`
8. Fix display in `DailyNutritionLog.tsx`

