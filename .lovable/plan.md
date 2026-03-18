# Plan: Fix Meal Plan Math, FK Error, Search Priority, and Food Emojis

## Issue 1: Macro math is wildly wrong when adjusting quantities

**Root cause**: In `MealPlanBuilder.tsx` line 390, `addFoodToMeal` computes `cal_per_100` as `(food.calories / ss) * 100`. The `food.calories` value from `FoodSearchPanel` is already **per serving** (e.g., 120 cal for a 240ml serving of Fairlife). So `cal_per_100 = (120 / 240) * 100 = 50`. Then `calcMacros` does `gram_amount / 100 * cal_per_100` → for 125ml: `125/100 * 50 = 62.5 cal`. This is correct math.

**But**: The bug is that many foods from the `foods` table (used by search-foods edge function) store values as **per 100g** in fields like `calories_per_100g`. When FoodSearchPanel maps these, it scales them to per-serving values. If `serving_size` is `null` or `0`, the division breaks. Also, when loading existing plans (lines 222-239), the fallback `fi?.serving_size || 100` may not match the actual stored serving, causing the per-100 conversion to be wrong.

Let me verify by checking the FoodSearchPanel mapping more carefully.

Actually, looking at the screenshot: "Fairlife partly skimmed milk 2%" shows **15000cal** for 125ml and **1625P 750C 562.5F**. This means `cal_per_100` is being computed as `15000/125*100 = 12000`, which is absurdly high. The issue is likely that `food.calories` coming from FoodSearchPanel is already a per-100g value (e.g. from `foods` table `calories_per_100g`), NOT a per-serving value, and then `serving_size` might be `1` or very small.

Looking at the `FoodResult` interface: `calories: number` and `serving_size: number`. The FoodSearchPanel maps from `useFoodSearch` results which come from the `search-foods` edge function that returns `foods` table rows with `calories_per_100g`. The mapping in FoodSearchPanel likely scales these to per-serving already.

Actually the real problem is clearer: when a **custom food** (from `client_custom_foods` or `food_items` with `data_source="custom"`) is created with macros **per serving** (e.g., 120cal per 240ml), it's stored in `food_items` with those values directly as `calories`, `protein`, etc. But `serving_size` might be stored as `240`. When `addFoodToMeal` computes `cal_per_100 = (food.calories / ss) * 100` → `(120/240)*100 = 50`. This is correct.

The bug must be somewhere in how the data is loaded or the serving_size is wrong. Let me check: the screenshot shows "125 ⬆" next to "ml" — user typed 125. The macros show 15000cal. `15000 = 125 * 120`. So `cal_per_100 = 120*100 = 12000`. This means `ss` was `1` during the conversion — `(food.calories / 1) * 100 = 12000`.

**The bug**: `food.serving_size` is likely `undefined`, `null`, or `0`, and the fallback `food.serving_size || 100` doesn't catch cases where the value is actually set to something like `1` (some foods have `serving_size_g: 1` meaning "per gram"). Or more likely, the custom food was created via `CreateFoodScreen` or `CustomFoodCreator` but stored `serving_size` as the actual amount (240ml) but the search returns it differently.

Actually, the simplest explanation: when `food.serving_size` is `0` or falsy, `ss = food.serving_size || 100` falls back to 100. But if `food.serving_size` is a valid small number like 1, then `cal_per_100 = (120/1)*100 = 12000`.

**Fix**: The per-100 conversion in `addFoodToMeal` needs to be more robust. Use: `const ss = Math.max(food.serving_size || 100, 1)`. But more importantly, need to check if the incoming calories are already per-100g or per-serving. The `foods` table stores `calories_per_100g` — if search returns those directly, we should use them directly as `cal_per_100` without re-conversion.

**Plan**: In `addFoodToMeal`, detect whether the food data has `per_100g` values available (from the `foods` table via search) versus per-serving values (from `food_items` table). Use `cal_per_100` directly when available, otherwise compute from per-serving / serving_size * 100 with a safe denominator.

## Issue 2: Foreign key constraint on `meal_plan_items.food_item_id_fkey`

**Root cause**: The `meal_plan_items` table has an FK `food_item_id → food_items.id`. When a custom food is created via `CreateFoodScreen` it goes into `client_custom_foods`, NOT `food_items`. So when saving the meal plan, `food_item_id` references a UUID that doesn't exist in `food_items`.

**Fix**: In `handleSave` (line 601), set `food_item_id: null` when the food doesn't have a valid `food_items` ID. Store the food name in `custom_name` instead (already done on line 602). The issue is that `food.food_item_id` contains the `client_custom_foods` UUID, not a `food_items` UUID. Need to either:

1. Set `food_item_id` to `null` for custom foods (safest)
2. Or import custom foods into `food_items` before saving

Option 1 is simplest: in `handleSave`, validate `food_item_id` — if it looks like it came from a non-food_items source, set to null.

Actually, better fix: when `addFoodToMeal` adds a custom food from FoodSearchPanel, the `food.id` may be from `client_custom_foods` or `foods` table (not `food_items`). The FK expects a `food_items` ID. So we need to make `food_item_id` nullable in the insert — set it to `null` when the food doesn't exist in `food_items`, and always populate `custom_name`.

**Plan**: In `addFoodToMeal`, track whether the food source is `food_items` or not. In `handleSave`, only include `food_item_id` if it's a valid `food_items` reference; otherwise set `null`.

## Issue 3: Switch search priority from FatSecret → OpenFoodFacts

**Root cause**: `search-foods/index.ts` calls `searchFatSecret()` as the primary external API.

**Fix**: Replace `searchFatSecret` call with an OpenFoodFacts call using the existing `open-food-facts-search` edge function or direct API call. Priority chain becomes:

1. Local `foods` table cache (with user history boost)
2. OpenFoodFacts ([world.openfoodfacts.org](http://world.openfoodfacts.org)) 3. USDA