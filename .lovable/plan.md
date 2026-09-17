# Fix meal plan foods showing grams instead of units

## The problem

In a client meal plan (or a plan opened from the master library), some foods show "2 g" or "1 g" when they should show "2 unit" / "1 unit". Deleting the food and re-adding it fixes it, which means the unit is being lost when the plan is carried over — not when you first pick the food.

Confirmed cause: when a plan is brought in from a template or copied from another client, the code reads the unit from a linked food record that is always empty for meal plan foods (foods are stored by name, not by link). So it falls back to grams and then saves that back. Freshly added foods keep their unit, which is why the same plan can show "1 unit" for one banana and "1 g" for another.

## The fix (display and copy logic only, no database changes)

1. Copy from another client: read each food's own saved unit and serving weight instead of the empty linked record, falling back to grams only when nothing was stored.
2. Assign/import a template: same correction, so template plans keep "unit", "slice", "scoop", etc.
3. Meal plan builder loading: prefer the unit and serving weight saved on the plan food itself over the linked record, so a re-open never downgrades a unit food to grams.

Existing plans that were already saved as grams stay as they are (per your choice) — those still need re-entering once.

## Verification

- Copy a plan from another client containing Eggs, Banana and Bagel; confirm the quantity boxes read "unit" and calories match.
- Assign a master library template with unit foods; confirm units survive, then save and re-open the plan and confirm they are still units.
- Confirm gram foods (chicken, honey, whey) still show grams with unchanged macros.
- Type check passes.

## Technical notes

Files: `src/components/nutrition/CopyFromClientModal.tsx` (~line 288-302), `src/components/nutrition/AssignTemplateModal.tsx` (~line 169), `src/components/nutrition/MealPlanBuilder.tsx` (lines 271-272 and 390-391).

Change pattern: `fi?.serving_unit || "g"` becomes `item.serving_unit || fi?.serving_unit || "g"`, and `fi?.serving_size || 100` becomes `item.serving_size || fi?.serving_size || 100`. `meal_plan_items.food_item_id` is always null by design, so `fi` is never populated. Macro-per-100g math continues to use the resolved serving size, keeping calorie totals identical to what is stored.
