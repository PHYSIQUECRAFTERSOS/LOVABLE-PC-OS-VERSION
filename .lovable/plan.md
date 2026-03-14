

# Fix Nutrition: Voice Log, Barcode Scanner, Brand Search

## 1. Remove Voice Log Button
**File:** `src/components/nutrition/AddFoodScreen.tsx` (line 762)
- Remove the Voice Log `QuickActionCard` entirely
- Change grid from `grid-cols-4` to `grid-cols-3` so the remaining 3 actions (Barcode, Meal Scan, Quick Add) fill evenly
- Remove unused `Mic` import

## 2. Fix Barcode Scanner Reliability

**Root cause:** The scanner uses a fragile double-camera pattern — it opens a "warm" MediaStream to detect the device ID, then **stops** that stream and lets `@zxing/library`'s `decodeFromVideoDevice()` open a **second** stream. On many mobile devices (especially iOS), this second stream fails silently, leaving the scanner dead.

**Fix in `src/components/nutrition/BarcodeScanner.tsx`:**
- Replace `decodeFromVideoDevice(preferredDeviceId, videoEl, callback)` with `decodeFromStream(warmStream, videoEl, callback)`
- Keep the warm stream alive instead of stopping it — zxing will decode directly from the already-running stream
- Remove the lines that stop the warm stream and null out `srcObject` before calling zxing (lines ~262-264)
- Move `streamRef.current = warmStream` to persist it for cleanup
- Remove the `streamSyncTimer` interval that tries to re-grab the stream from the video element (no longer needed since we own the stream)
- Keep the watchdog timer for frame-ready detection and auto-retry
- Auto-start the scanner immediately when the dialog opens (already done via useEffect at line 529-533)

This matches how MyFitnessPal works — one continuous camera stream, zxing reads every frame.

## 3. Improve Brand Search Prioritization

**Problem:** When searching "pacific sunrise yellow flesh potatoes", the edge function returns generic USDA results because brand relevance scoring is weak — it only gives +50 for a partial brand word match and +20 for USDA source, so generic USDA items outscore branded OFF results.

**Fix in `supabase/functions/search-foods/index.ts`:**

### A. Improve `brandRelevanceScore()` function:
- **Exact brand match**: +100 (brand contains entire multi-word brand query)
- **Full name contains entire query**: +80
- **Brand word match**: +50 (keep)
- **Branded items bonus**: +30 for any item with `is_branded: true`
- **Penalize generic**: -20 for items with no brand when the query has 2+ words (likely a brand search)
- **OFF branded items**: +15 (OFF branded products are often the exact retail product)
- **Complete macros bonus**: +10

### B. Better brand detection in query:
- Current `likelyBrandSearch` just checks `queryWords.length >= 2` — too broad
- Add smarter detection: if the query contains words that match known brand patterns OR if OFF returns branded results, boost those heavily

### C. Increase OFF page size for brand searches:
- Change `page_size=30` to `page_size=50` for brand searches to increase the chance of finding the exact branded product
- Add `sort_by=popularity_key` parameter for brand searches (sorted by popularity increases chance of exact match)

## Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/AddFoodScreen.tsx` | Remove Voice Log button, adjust grid to 3 cols |
| `src/components/nutrition/BarcodeScanner.tsx` | Use `decodeFromStream` with persistent stream |
| `supabase/functions/search-foods/index.ts` | Improve brand relevance scoring and OFF search params |

