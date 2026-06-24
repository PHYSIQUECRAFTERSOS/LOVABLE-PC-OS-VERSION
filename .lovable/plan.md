## Goal

Fix three concrete bugs in the meal-section AI import that show up clearly in Zach Ivie's plan:

1. **"3 slice" turkey bacon and "2 unit" eggs become 3g / 2g** — the importer regex grabs the number and treats every quantity as grams.
2. **Brazil Nuts 10g = 71 cal in the PDF becomes ~233 cal in the app** — the importer overwrites PDF macros with whatever `food_items` row was matched, even when the match is a wildly different serving size.
3. **No coach-library preference** — matching scans the entire 4,300-row `food_items` table by ilike, so generic / wrong-brand rows beat your own custom foods.

Per your answers: always trust the PDF macros, prefer your own custom foods first, and preserve non-gram units by auto-creating a sized custom food.

## What changes

### 1. Edge function — `supabase/functions/ai-import-processor/index.ts`

**A. Extraction prompt (meal block)**
Replace the single `quantity` string with three fields the AI must always emit:

- `quantity_value` (number, required)
- `quantity_unit` (string, required — one of `g`, `ml`, `oz`, `slice`, `unit`, `scoop`, `cup`, `tbsp`, `tsp`, `piece`, `serving`)
- `calories`, `protein`, `carbs`, `fat` — **required, copied verbatim from the PDF row**, never inferred.

Add: "If the PDF row gives macros, those macros are the source of truth — do not round, infer, or substitute."

**B. `matchFoods()` rewrite**
- Add a `coachId` argument (passed from the request).
- Build candidate list in this order, returning the first non-empty bucket:
  1. `food_items` where `created_by = coachId` (your coach library)
  2. `food_items` where `created_by` is in the coach's `coach_clients` list (your clients' custom foods, since `client_custom_foods` is RLS-locked to its owner)
  3. `food_items` where `is_verified = true`
  4. global `food_items`
- Score with existing `scoreNormalized` + a strong substring boost. Require ≥75 to auto-accept; below that we still create a custom food (next step) so the match doesn't matter.
- Return `{ matched_id, matched_name, source: 'coach_library' | 'client_library' | 'verified' | 'global' | 'none', confidence_score }`.

### 2. Import commit — `src/components/import/AIImportModal.tsx`

Replace the gram-only parser (lines ~579–606) with this flow per food row:

1. Read `quantity_value`, `quantity_unit`, and the PDF macros from the AI output.
2. **Always store PDF macros** on `meal_plan_items.calories/protein/carbs/fat`. Never recalculate from the matched food_item.
3. Set `meal_plan_items.servings = quantity_value`, `serving_unit = quantity_unit`, `serving_size = quantity_value` (so the existing UI math `macros × servings / serving_size` resolves to the PDF macros for 1 serving).
4. For non-gram/ml units OR when the match is below 75 confidence: **create a backing `food_items` row** (or reuse one already created earlier in this import) sized to that quantity:
   - `name = food.name`, `brand = null`, `created_by = coachId`, `is_verified = false`
   - `serving_size = quantity_value`, `serving_unit = quantity_unit`
   - `calories/protein/carbs/fat` = PDF macros (so it represents "1 slice", "2 units", "10g" with those exact macros)
   - Then link `food_item_id` to this new row.
5. For high-confidence gram matches, keep the existing `food_item_id` link but still write PDF macros on the meal_plan_item.

Skip rows where `quantity_value` is missing or 0.

### 3. Backward compatibility

- `meal_plan_items` already has `serving_unit` and `serving_size` — no schema migration needed.
- `gram_amount` stays populated (set to `quantity_value` when unit is `g`/`ml`, otherwise `quantity_value`) so legacy readers don't break.
- Existing meal plans are untouched.

### Verification

Re-run AI Import on Zach Ivie's PDF and confirm in the rest-day Meal 1:
- Whole Egg (Medium): 2 unit, 120 cal, 12P / 0C / 8F
- Egg Whites: 100 g, 42 cal, 11P / 0C / 0F
- Spinach: 20 g, 6 cal
- Turkey Bacon: 3 slice, 119 cal, 15P / 3C / 5F
- Brazil Nuts (Greek yogurt meal): 10 g, 71 cal, 1P / 1C / 7F

## Files touched

- `supabase/functions/ai-import-processor/index.ts` — extraction prompt + `matchFoods()` + threading `coachId` through
- `src/components/import/AIImportModal.tsx` — quantity/unit parsing + macro-preservation + custom-food creation path

No database migrations. No changes to existing meal plans, workout import, or supplement import.
