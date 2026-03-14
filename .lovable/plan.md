

# Fix Supplement Scan Flow: Photo-Based with Serving Size & Quantity Adjustment

## What's Changing

### 1. Button & Copy Updates
- **SupplementLogger.tsx**: Change "Scan" button icon from `ScanBarcode` to `Camera`, label from "Scan" to "Take Photo"
- **SupplementScanFlow.tsx**: Change dialog title from "Scan Supplement Label" to "Take Photo of Label"

### 2. Review Form Restructure (SupplementScanFlow.tsx)
Current: Shows "Servings / Container" field
New layout:
- **Product Name** + **Brand** (2-col, keep)
- **Serving Unit** (keep) + **Serving Size** (new number field — e.g. "8" capsules, extracted from AI's `serving_size` like "8 Capsules")
- Remove "Servings / Container" — not useful for clients
- Save `serving_size` to the DB (already exists as a number column)

### 3. AI Prompt Update (Edge Function)
Update `analyze-supplement-label` prompts to also extract a numeric `serving_size_qty` (e.g. 8 from "Serving Size: 8 Capsules") so the review form can pre-fill it. Add this to both the tool-calling schema and plain-text prompt.

### 4. Quantity Adjuster on Supplement Cards (SupplementLogger.tsx)
After a supplement is saved with `serving_size = 8` and `serving_unit = "capsule"`:
- When client logs it, the existing servings adjuster (+/-) already works
- But we need to show the **effective nutrients** scaled by `(logged_servings / serving_size)` instead of `* servings`
- Example: Label says per 8 capsules. Client takes 3. Multiplier = 3/8 = 0.375. Each nutrient × 0.375.
- Update the `SupplementCard` expanded nutrient display to use this ratio

### 5. Logging UX Improvement
- When clicking "Log", default the servings to the supplement's `serving_size` value (e.g. 8)
- The +/- buttons adjust the actual number of capsules/tablets taken
- Display shows: "3 of 8 capsules" format so client knows the ratio

## Files to Edit

| File | Changes |
|------|---------|
| `src/components/nutrition/SupplementLogger.tsx` | Button icon/label, card nutrient scaling, log default serving |
| `src/components/nutrition/SupplementScanFlow.tsx` | Add serving_size field, remove servings_per_container, save serving_size to DB, update copy |
| `supabase/functions/analyze-supplement-label/index.ts` | Extract `serving_size_qty` from label (numeric count) |

## Nutrient Calculation Logic
```
per_unit_nutrient = label_nutrient_value / serving_size
effective_nutrient = per_unit_nutrient * client_quantity
```
Example: Vitamin A = 450 mcg per 8 capsules. Client takes 3 → 450 / 8 * 3 = 168.75 mcg.

