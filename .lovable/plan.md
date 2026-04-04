

## Fix Barcode Lookup Cascade: FatSecret → OFF → USDA

### Problem
The `barcode-lookup` edge function skips FatSecret entirely, going straight to OpenFoodFacts. Many products (especially US branded items) exist in FatSecret but not OFF, causing scan failures.

### Changes

**File: `supabase/functions/barcode-lookup/index.ts`** — Rewrite cascade order

The existing FatSecret OAuth + API pattern from `fatsecret-proxy/index.ts` will be inlined into `barcode-lookup`. The response shape stays identical so `barcodeService.ts` needs zero changes.

New cascade:
1. **Local cache** (unchanged) — check `foods` table by barcode
2. **FatSecret** — OAuth 2.0 client credentials → `food.find_id_for_barcode.v2` with normalized EAN-13 barcode → `food.get.v4` for full nutrition → map to per-100g → upsert into `foods` → return
3. **Open Food Facts** — change URL from `api/v0` to `api/v2` and ensure `world.openfoodfacts.org` (already correct) → upsert into `foods` → return
4. **USDA** — unchanged final fallback, add upsert into `foods` before return
5. **Not found** — unchanged

Key implementation details:
- Copy the `getAccessToken()` and `fatSecretAPI()` helpers from `fatsecret-proxy` into `barcode-lookup`
- Copy `normalizeBarcode()` and `mapFatSecretFood()` from `fatsecret-proxy`
- After FatSecret returns mapped data, upsert into `foods` table with `onConflict: "barcode"`, then return the standard response shape (`found`, `name`, `brand`, `per_100g`, `per_serving`, `source`, `serving_size`, `serving_quantity`)
- USDA fallback also gets the same upsert treatment (currently it doesn't cache)
- All external IDs stay out of the response — only the barcode itself is returned as identifier

**No other files change.** `barcodeService.ts`, `BarcodeScanner.tsx`, `CreateMealSheet.tsx`, and all other consumers already call `barcode-lookup` and parse the same response shape.

### Technical Detail
- FatSecret uses OAuth 2.0 client credentials (not OAuth 1.0 — the v2/v3/v4 REST API uses Bearer tokens). The existing `fatsecret-proxy` already does this correctly.
- `food.find_id_for_barcode.v2` returns `{ food_id: { value: "12345" } }`. If normalized EAN-13 fails, retry with original barcode.
- `food.get.v4` returns full servings data which gets mapped to per-100g via the same `mapFatSecretFood` logic already proven in the proxy.

