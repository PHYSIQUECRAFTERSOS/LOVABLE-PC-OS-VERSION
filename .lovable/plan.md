## Problems Found

**Supplements PDF — missing supplements**
`exportSupplementsPdf.ts` groups items by `timing_slot`, then only renders slots in a hardcoded list: `morning, pre_workout, intra_workout, post_workout, with_meal, evening, before_bed, any_time`. Jack's plan also uses `fasted` and `meal_1` — those buckets (10 of 17 items, including Creatine, Glutamine, Psyllium, Iodine, Yohimbine, Caffeine, Triumph, Vitamin D3, Fish Oils, Magnesium) are silently dropped.

**Meal Plan PDF — missing rest day**
Jack has one `meal_plans` row with two `meal_plan_days` (training + rest) — not two separate plans. `exportMealPlanPdf.ts` only iterates `meal_plans` rows and groups items by `meal_order`, mixing both days into a single section. The rest day never renders.

## Fix Plan

### `src/utils/pdf/exportSupplementsPdf.ts`
1. Expand `TIMING_LABELS` to include every slot used in the app: add `fasted` ("Fasted / Morning"), `meal_1`…`meal_6` ("With Meal 1"…"With Meal 6"), `pre_bed` (alias), plus existing labels.
2. Replace the hardcoded `orderedSlots` filter with: take all keys in `grouped`, sort by a preferred-order map, and append any unknown slots at the end with a humanized label (`slot.replace(/_/g, " ")` title-cased) so nothing is ever dropped.
3. Preferred order: `fasted, morning, pre_workout, intra_workout, post_workout, meal_1, meal_2, meal_3, meal_4, meal_5, meal_6, with_meal, evening, before_bed, pre_bed, any_time`.

### `src/utils/pdf/exportMealPlanPdf.ts`
1. For each meal plan, fetch `meal_plan_days` (`id, day_type, day_order`) ordered by `day_order`.
2. If days exist: render one section per day (Training Day → Rest Day order via day_type rank), filtering items by `day_id`. Section title uses day_type label ("Training Day" / "Rest Day"). Each day starts on a new content page.
3. If a plan has no days (legacy data), fall back to current behavior (single section, all items).
4. Macro target row still pulls from the parent `meal_plans` row (targets are stored there); meal totals are computed per-day from filtered items.
5. Cover page subtitle stays "Training Day & Rest Day Macros".

### Out of scope
- No DB schema changes.
- No edits to the print buttons or UI.
- Training PDF untouched.

### Verification
After edits, re-export for Jack Fisher and confirm:
- Supplements PDF lists all 17 items across Fasted, Meal 1, Pre-Workout, With Meal, Before Bed, Any Time sections.
- Meal Plan PDF shows two clearly separated sections — Training Day and Rest Day — each with its own meals and totals.
