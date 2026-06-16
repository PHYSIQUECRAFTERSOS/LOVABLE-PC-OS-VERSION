## The Problem (Root Cause Confirmed)

When you save a meal plan, every food's macros are **rounded to integers before being stored** in the database. Auto Track then copies those already-rounded values into the nutrition tracker.

Example from Kevin's plan (from the DB):
- Egg White 200g → stored as `104 cal, 22P, 1C, 0F` (real value is ~104.0 cal / 21.6P / 1.44C / 0.3F)
- Blueberries 100g → stored as `57 cal, 1P, 14C, 0F` (real value ~57 / 0.7 / 14.5 / 0.3)

Each row loses up to ~1 cal / 1 g per macro to rounding. Sum 25 foods and you get a ±5–90 cal drift vs the daily target — exactly the "-7 cal, -2g C" and "-88 cal" your clients are reporting.

The display target (3267) was computed from the same rounded items, but when copied to the tracker the rounding gap shows up as "calories off."

This also violates the existing project memory **"Meal Plan Math Integrity — Raw float accumulation, UI-only rounding to prevent drift"** — the builder is currently breaking that rule on save.

## The Fix

Store the **true float** macros in the database; round **only at the moment of rendering**. The DB columns are already `numeric` so no migration is needed.

### 1. `src/components/nutrition/MealPlanBuilder.tsx`
- In the save payload (currently lines ~612–615), remove `Math.round()` around `calories / protein / carbs / fat`. Store the precise `cal_per_100 * gram_amount / 100` floats.
- Compute the plan's `target_calories / target_protein / target_carbs / target_fat` from the **raw float** sum of all items (no per-item rounding), then `Math.round()` only the final stored target. This makes the target consistent with what tracker totals will display.
- In the builder UI, wrap every macro readout in `Math.round(...)` at render time (Meal headers, per-item `104cal 22P 1C 0F`, day totals, Nutrition Goal "left" pills). The user explicitly required: never show decimals.

### 2. `src/hooks/useMealPlanTracker.ts` (`copyMealToTracker` + `copyEntireDayToTracker`)
- No logic change needed — already passes `Number(item.calories)` through. Once the source stores floats, the tracker receives floats automatically.
- Keep the existing `quantity_display / quantity_unit` mapping (per Meal Plan → Tracker Integration memory).

### 3. `src/components/nutrition/DailyNutritionLog.tsx` (Tracker view)
- Audit the "Daily Total", "Remaining", and per-meal subtotals: ensure they sum the **raw floats** from `nutrition_logs` and call `Math.round()` only at render. Per-food line items (e.g. "104 cal · 22P") also render via `Math.round()`.
- "Remaining" = `Math.round(target) − Math.round(sum_raw)` → 0/0/0/0 when the user fully tracks the plan as written.

### 4. Backfill existing Kevin Wu / Keith / Andrew plans (one-shot)
For meal plan items where `food_item_id` is set, recompute `calories/protein/carbs/fat` from `food_items.{calories,protein,carbs,fat}` (per `serving_size`) × `gram_amount`, storing the floats. For custom-name-only items (no `food_item_id`, like the ones in Kevin's plan above) we cannot recover the lost decimals — they stay as the existing integers, but **all future edits/additions will be stored as floats**. Clients with active plans can be fixed by you simply re-saving the plan once in the builder (every row recomputes from per-100g source).

Optionally I can also re-derive `cal_per_100` etc. for legacy custom items from existing rounded values and re-multiply by gram_amount to at least keep them internally consistent — let me know if you want that.

### Out of scope (not changing)
- The food database itself (FatSecret/USDA values are upstream truth).
- The nutrition goal editor / macro sliders.
- Supplements meal handling.
- No new tables, no RLS changes, no schema migration.

## Why this fully solves both client complaints
- **Andrew (-88 cal "macros perfect but cal off")**: macros and calories were each independently rounded per item, so the relationship `4P + 4C + 9F = cal` broke at the daily level. Floats preserve the relationship; rounding only at display means the visible totals still read as whole numbers AND add up.
- **Keith ("copying from plan but calories off")**: target was rounded ints summed from rounded items; tracker sum was the same rounded ints — but the **target editor** and **plan editor** rounded at different stages. After the fix, target = round(raw sum), tracker = raw sum → "0 left" when fully tracked.

## Clarifying questions before I build
1. **Backfill scope:** Should I re-derive integer-stored legacy items (no `food_item_id`) by treating their stored integers as the source of truth and just leaving them alone (drift persists for old plans until you re-save), OR run a one-shot script that re-saves every active plan's items by recomputing from `gram_amount * (storedValue / gram_amount)` (no real precision gained — same result)? Realistically the only true fix for legacy custom items is **you re-open and save each active plan once**. Confirm you're OK with that.
2. **Decimal display:** Confirm `Math.round()` (nearest integer) everywhere — not `Math.floor` or 1-decimal. The screenshots all show whole numbers so I'll assume round-to-nearest.
3. Anything else besides Tracker, Meal Plan builder, and "My Meal Plan" client view that needs the same display rounding pass?
