# Coach Notes on Meal Plans

Let coaches attach plain-text notes to each **meal** (e.g., "Have ½ tsp potassium salt + 500ml water after this meal") and to each **food item** (e.g., "Mix with greek yogurt"). Clients see them inline in their meal plan view. Notes are naturally per day-type because each `meal_plan_days` row already has a `day_type` (Training / Rest), so editing under the Training day only affects training, and Rest day only affects rest.

## Schema changes (one migration)

1. **New table `meal_plan_meal_notes`** — meal-level note keyed by the meal grouping inside a day.
   - `id uuid pk`
   - `day_id uuid not null` → `meal_plan_days(id) on delete cascade`
   - `meal_order int not null` (matches existing `meal_plan_items.meal_order`)
   - `meal_name text not null` (denormalized for resilience if order shifts)
   - `note text not null default ''`
   - `created_at`, `updated_at` with trigger
   - `unique (day_id, meal_order)`
   - RLS mirrors `meal_plan_days`: coach owner / admin manage; client of the parent plan can SELECT.

2. **Add column `note text` to `meal_plan_items`** — per-food note. Nullable.

No data migration needed (additive).

## Coach UI — `MealPlanBuilder.tsx`

Reference: the screenshot shows each meal header (`Meal 1 (Pre-Workout)`, `Meal 2 (Post workout)`) with food rows underneath.

- **Meal-level note**: under each meal header, add a collapsible `Coach note` row. Single textarea (multiline, line breaks preserved). Debounced save (~600ms) → upsert into `meal_plan_meal_notes` keyed by `(day_id, meal_order)`. Empty string deletes the row.
- **Food-item note**: small note icon button on each food row (next to the trash icon). Click → inline expands a small textarea below the row. Debounced save → updates `meal_plan_items.note`. A filled note shows the icon in gold; empty in muted gray.
- Both editors are plain `<textarea>` styled to match the dark card aesthetic. No rich formatting.
- Notes load with the existing meal-plan fetch (`useMealPlanTracker` / builder query) — extend the select to include the new table + column.

## Client UI — `ClientStructuredMealPlan.tsx` (the view clients see under Nutrition → Meal Plan)

- Under each meal header (e.g., "Meal 1 (Pre-Workout)"), if a meal note exists, render it as a small gold-bordered card with `Coach Note` label and `whitespace-pre-wrap` text so line breaks survive.
- Under each food row, if `note` is set, render a one-line muted italic text beneath the food name.
- Read-only for clients.

## Files touched

- `supabase/migrations/...` — new table + new column + RLS + trigger.
- `src/components/nutrition/MealPlanBuilder.tsx` — meal-note editor + food-note editor + save logic.
- `src/components/nutrition/ClientStructuredMealPlan.tsx` — render notes inline.
- `src/hooks/useMealPlanTracker.ts` — include `note` and meal notes in fetch shape.
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.

## Verification

1. Coach: open a client meal plan, add a meal note on Meal 1 of Training Day, add a food note on Rice Krispy Cereal. Reload — both persist.
2. Switch to Rest Day tab — notes are independent (different `day_id`).
3. Log in as that client → Nutrition → Meal Plan: meal note shows under Meal 1 header (line breaks preserved); food note shows under the food name.
4. Clear the textarea → row deleted / column cleared on next debounced save.
