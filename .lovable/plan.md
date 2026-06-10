## Problem

When assigning a meal plan template from Master Libraries to a client, three fields are silently dropped:

1. **Serving unit** — items copy `gram_amount` and `servings` but skip `serving_unit` and `serving_size`. Eggs (`2 units`) and Caramel rice cakes (`2 units`) render as `2 g` on the client.
2. **Per-item note** — the `note` column on `meal_plan_items` isn't copied.
3. **Per-meal coach note** — those live in a separate table `meal_plan_meal_notes` (one row per `day_id` + `meal_order`) and aren't copied at all, so Meal 1's "add 1/4 tsp salt + dash black pepper" is lost.

## Fix

Edit `handleCopyToClient` in `src/components/nutrition/MealPlanTemplateLibrary.tsx`:

1. When inserting into `meal_plan_items`, add the missing columns to the mapped row:
   - `serving_unit: item.serving_unit`
   - `serving_size: item.serving_size`
   - `note: item.note`

2. After all days + items are inserted, copy the per-meal notes:
   - Fetch all `meal_plan_meal_notes` rows whose `day_id` is in the source template's day IDs.
   - For each row, look up the corresponding new `day_id` (built from the old→new day map already established in the loop) and insert a fresh row with the new `day_id`, same `meal_order`, `meal_name`, and `note`.

3. Track the old→new `day_id` mapping in a `Record<string,string>` inside the existing day loop instead of relying on filter-by-id.

No DB changes, no RLS changes — `meal_plan_meal_notes` already has policies and the columns already exist. Existing archive-on-assign behavior is untouched.

## Files touched

- `src/components/nutrition/MealPlanTemplateLibrary.tsx` — one function (`handleCopyToClient`).

## Verification

After the fix, reassign the same template to Kevin and confirm on the client meal-plan view:
- Eggs show `2 units`, Caramel rice cakes show `2 units`.
- Meal 1 displays "add 1/4 tsp salt + dash black pepper".
- Item-level notes (the small note icon next to each food) carry over.
