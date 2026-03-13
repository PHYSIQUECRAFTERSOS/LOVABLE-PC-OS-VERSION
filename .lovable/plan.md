

# Fix Plan: Micros Dashboard + Supplement Scanner

## Problem 1: Micros Dashboard Always Shows 0

**Root Cause**: The `nutrition_logs` table has micronutrient columns (vitamin_a_mcg, vitamin_c_mg, etc.) but they are **never populated** during food logging. Every insert across the codebase only writes calories, protein, carbs, fat, fiber, sugar, sodium. The `food_items` table also has all micronutrient values at 0 for every item.

**Fix**: When logging food from a `food_item_id`, look up that food item's micronutrient values and include them in the insert. This requires:

1. **`src/components/nutrition/AddFoodScreen.tsx`** — In the `logFoodItem` handler, after computing macros with `multiplier`, also compute micronutrient values from the food item data and include all micro columns in the insert.

2. **`src/components/nutrition/MealScanCapture.tsx`** — The AI meal scan currently only returns macros. No micronutrient data is available from the scan, so this will remain limited. But we should ensure the fields default to 0 explicitly.

3. **`src/hooks/useMealPlanTracker.ts`** — When copying from meal plan, include micronutrient columns from the meal plan entries.

4. **`src/components/nutrition/BarcodeScanner.tsx`** — When logging barcode-scanned items, include micronutrients if available from Open Food Facts data.

5. **USDA food search enrichment** — The USDA edge function already returns micronutrient data (vitamin_c_mg, iron_mg, etc.). The `food_items` table needs to be populated with these values when items are cached from USDA/OFF searches. Currently the search-foods edge function and the food item caching logic likely strips micros.

**Key insight**: The biggest impact fix is ensuring that when a food item is selected from search results (USDA/OFF), its micronutrient data is saved to `food_items` and then carried through to `nutrition_logs` on insert.

---

## Problem 2: Barcode Scanner Returns "Not Found"

**Root Cause**: The `barcode-lookup` edge function uses Open Food Facts API **v2** (`/api/v2/product/`) which returns 404 for many products. The client-side `barcodeService.ts` correctly uses v0 (`/api/v0/product/`).

**Fix**: Update `supabase/functions/barcode-lookup/index.ts` to use `/api/v0/product/` instead of `/api/v2/product/`. Also add the UPC Item DB fallback that the client-side service has.

---

## Problem 3: Supplement Label AI Scan Fails ("No nutrients detected")

**Root Cause**: The AI gateway returns HTTP 400 with "Unable to process input image" from Google AI Studio. This is a known issue with `gemini-2.5-flash` when images are over-compressed or in certain base64 formats.

**Fix**:
1. **`supabase/functions/analyze-supplement-label/index.ts`** — Switch model to `google/gemini-2.5-pro` which handles image inputs more reliably, especially for dense text on supplement labels.
2. **`src/components/nutrition/SupplementScanFlow.tsx`** — Increase image compression quality (from 0.3MB to 0.5MB) and max resolution (from 800px to 1200px) so the label text remains readable for the AI. Add retry logic with a fallback model.
3. **Edge function error handling** — Return the actual error message from the AI gateway (400 "unable to process image") instead of generic "AI analysis failed" so the UI can show a more helpful message.

---

## Implementation Order

1. Fix barcode-lookup edge function (v2 → v0 URL + UPC fallback) — immediate impact
2. Fix analyze-supplement-label (model upgrade + compression settings) — immediate impact  
3. Add micronutrient propagation to nutrition_logs inserts — requires changes across multiple logging components
4. Ensure food_items caching includes micronutrient data from USDA/OFF

## Technical Details

- All changes are in existing files; no database migrations needed (columns already exist)
- Edge functions will auto-deploy after changes
- The micronutrient propagation requires adding ~25 fields to each insert call, which will be done via a shared helper function to avoid code duplication

