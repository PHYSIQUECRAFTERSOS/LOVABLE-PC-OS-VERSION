## Goal

Fix PC recipe logging so clients can log a real-world portion (e.g. "1 of 8 muffins" or "1/4 of the batch") and get the correct macros in their diary, with one clean summary row instead of fanned-out ingredients.

## Math model

- `pc_recipes.servings` (yield) is treated as the **total batch yield** — e.g. 8 muffins.
- Sum of all `pc_recipe_ingredients` macros = **full batch totals** (584 cal for the whole muffin tray).
- **Per-serving** macros = batch totals / yield.
- Client picks `portionsEaten` (default 1). Logged macros = perServing × portionsEaten.
- Live macro card on the detail screen always shows what will be logged for the current portion selection.

## 1. `PCRecipeDetail.tsx` — portion picker UI

Replace the current `−  1 Servings  +` stepper (which currently multiplies the whole batch) with a portion-of-batch picker.

Layout (top of screen, under recipe name):

```text
  Makes 8 muffins                ← small muted label from recipe.servings
  ┌──────────────────────────────────────────┐
  │  Portion                                 │
  │  [1/8] [1/6] [1/4] [1/2] [1] [2]   ← chips (gold when active)
  │                                          │
  │  or enter exact:  [ 1      ] portions    │
  │                       ↑ tap-to-type, accepts "0.5", "1.5", "1/3"
  └──────────────────────────────────────────┘

  73 cal     8g P    11g C    1g F           ← live, = perServing × portion
  CALORIES  PROTEIN  CARBS   FAT
```

Behavior:
- Quick chips snap the portion to that exact value; manual input overrides.
- Fraction parser accepts `1/3`, `0.5`, `1.5`, `.25`; rejects negatives and >recipe.servings × 2 (sanity cap).
- Subtitle on the macro card: "1 of 8 (per portion) · 73 cal" so the math is transparent.
- Bottom CTA stays `Add to Meal X`.

Ingredient list display:
- Ingredients still render below the macro card for reference, but now scaled to the chosen portion (so 130g egg whites at 1/8 portion shows "16g · 9 cal") — purely informational; they are not logged individually anymore (see §3).
- Add a tiny "× 1/8 of batch" tag on the section header so the rescaling is obvious.

## 2. Recipe editor — make yield first-class

In `PCRecipeEditor.tsx`, the existing `servings` field exists but is buried. Promote it:

- Rename the UI label from "Servings" to **"Yield (this recipe makes)"** with helper text: *"Enter the total number of finished portions the full recipe produces — e.g. 8 muffins."*
- Show a live preview: *"Per portion: 73 cal · 8g P · 11g C · 1g F"* under the macro panel so the coach sees what the client will see.
- Default yield = 1 (unchanged) for backwards compatibility.

No schema change needed — `pc_recipes.servings` already stores this.

## 3. `PCRecipeDetail.addToLog` — single summary row

Currently the function fans out one `nutrition_logs` row per ingredient. Replace with **one** row representing the whole portion eaten, matching the user's chosen display:

Inserted row:
- `client_id`, `meal_type`, `logged_at`, `tz_corrected: true`
- `food_item_id: null`, `custom_name: "🍳 {recipe.name}"`
- `servings: portionsEaten` (numeric, supports fractions)
- `quantity_display: portionsEaten`, `quantity_unit: "portion"` (so `formatServingDisplay` renders as `"1 portion"` / `"0.5 portions"`)
- `calories/protein/carbs/fat`: full batch totals × (portionsEaten / yield), rounded
- Micronutrients: summed across ingredients, then scaled by the same factor (preserves existing micro behavior)
- Optional new tag in `custom_name`: when yield > 1, format as `"🍳 Protein Banana Muffin (1/8 batch)"` so the meal list shows context at a glance.

Diary row result (matches user's chosen example):
`🍳 Protein Banana Muffin (1/8 batch) · 1 portion · 73 cal · 8P · 11C · 1F`

## 4. Edge cases

- **Legacy recipes with yield = 1**: math collapses to current behavior (no break). Picker shows chips `[1/2] [1] [2] [3]` and no "of batch" label.
- **Yield = 0 / null**: treat as 1.
- **Manual input invalid**: keep last valid value, gentle red border, no toast spam.
- **Editing in coach view**: if a coach changes yield from 4 → 8 on an existing recipe, only future logs are affected; historical `nutrition_logs` rows are untouched.

## Files touched

- `src/components/nutrition/PCRecipeDetail.tsx` — picker UI, scaled ingredient display, new `addToLog` logic
- `src/components/nutrition/PCRecipeEditor.tsx` — promote `servings` field, add per-portion preview
- (no migration, no changes to `formatServingDisplay`, no changes to `AddFoodScreen`)

## Out of scope

- Re-verifying existing recipe yields (you confirmed stored macros = full batch — math just works).
- Saving custom default portions per client.
- Fan-out to per-ingredient rows (replaced by single summary row).