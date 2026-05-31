## Problem

Master Libraries → PC Recipes → Create Recipe (`PCRecipeEditor.tsx`) currently uses `fixed inset-0` — a full-screen mobile sheet — even on desktop, which looks stretched and unbalanced at 1050px+ widths (your screenshot shows huge empty space, edge-to-edge content).

Also, its built-in "Add Ingredient" search (lines 281-318) is a stripped-down list: tiny `search_foods` RPC results showing only name + macros. It is missing everything the meals "Add Food" panel has (the `AddFoodScreen` used by `DailyNutritionLog`): All / ★ Favs / Recent / Custom Foods / Branded / Generic / Saved Meals tabs, `+ Custom`, recently used, barcode scan, food emoji, brand line, etc.

## Fix

### 1. Desktop layout for `PCRecipeEditor.tsx` (and matching food-search overlay)

Keep the existing full-screen layout on mobile. On desktop (`md:` and up), render the editor as a centered modal card:

- Outer wrapper: `fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm md:flex md:items-center md:justify-center md:p-6`
- Inner card on desktop: `md:relative md:inset-auto md:w-full md:max-w-3xl md:h-[88vh] md:max-h-[900px] md:rounded-2xl md:border md:border-border md:shadow-2xl md:overflow-hidden` — body becomes a single scroll container, the sticky Save bar is pinned to the **card** bottom (not the viewport) via `md:absolute md:bottom-0 md:left-0 md:right-0` on the footer instead of the current `fixed bottom-0 left-0 right-0`.
- Inside the card, switch the content area at `md:` to a two-column grid: left column (Name, Description, Servings, Macro preview, Published toggle, YouTube preview) and right column (Ingredients list + Instructions). Mobile remains single-column stacked. Use `md:grid md:grid-cols-[1fr_1.2fr] md:gap-6 md:px-6 md:pt-5`.
- Increase desktop input sizing (`md:h-10`), give the macro preview card a fixed `md:p-4`, and constrain the YouTube preview to `md:max-w-md`.
- Close affordance on desktop: add an `X` button in the top-right of the card header (in addition to the existing `ArrowLeft`), and clicking the dimmed backdrop triggers the same "discard?" guard as the back arrow.

Apply the same desktop modal treatment to the inner "Add Ingredient" overlay (currently also `fixed inset-0 z-[60]`) so it appears as a centered card above the editor instead of taking the entire screen.

### 2. Replace the stripped-down ingredient search with the full picker

Reuse the existing `AddFoodScreen` experience (tabs, favs, recent, custom, branded, generic, saved meals, barcode, "+ Custom") for "Add Ingredient" — but `AddFoodScreen` is hard-wired to log directly into `nutrition_logs` (`mealType`, `logDate`, `onLogged`), so we cannot drop it in unchanged. Two-part change:

**a. Add a "picker mode" to `AddFoodScreen.tsx`:**

- New optional prop `mode?: "log" | "pick"` (default `"log"` to keep all existing call sites untouched) and `onPick?: (payload: { food_item_id?: string; food_name: string; quantity: number; serving_unit: string; calories: number; protein: number; carbs: number; fat: number }) => void`.
- When `mode === "pick"`:
  - Hide the "Save to diary" / meal-type chrome, hide barcode-auto-log behavior, hide Saved-Meal "log all" button (Saved Meals tab can simply be omitted in pick mode for v1 to keep scope tight — confirm if you want it kept).
  - The existing food detail / quantity editor (`FoodDetailScreen`) is reused; on its primary action, instead of inserting into `nutrition_logs`, call `onPick(payload)` and close.
  - Header label becomes "Add Ingredient" instead of the meal label.
- All search/tab/favorite/recent logic is shared — no duplication.

**b. Update `PCRecipeEditor.tsx`:**

- Delete the local `showFoodSearch` overlay block (lines 281-318), the `searchFoods` function, and `searchQuery`/`searchResults`/`searching` state.
- Render `<AddFoodScreen mode="pick" open={showFoodSearch} onClose={() => setShowFoodSearch(false)} onPick={(p) => { setIngredients(prev => [...prev, { ...p, base_quantity: p.quantity, base_calories: p.calories, base_protein: p.protein, base_carbs: p.carbs, base_fat: p.fat }]); setShowFoodSearch(false); }} mealType="" mealLabel="Add Ingredient" />`
- `AddFoodScreen` already styles itself as a full-screen sheet on mobile and (after change #1's pattern applied there too, if desired) can render as a centered modal on desktop — but since #1 only touches the editor card, the picker can keep its own current `fixed inset-0` and simply sit above it. If you'd like the picker to also be a centered desktop modal, say so and I'll apply the same wrapper.

### 3. Out of scope

- No DB schema changes.
- No changes to the client-side `Nutrition` page or the existing meals "Add Food" flow — those keep using `mode="log"` (the default).
- No changes to `CreateRecipeScreen.tsx` (a separate, unused-here component for client recipes).

## Open questions

1. In pick mode for "Add Ingredient", do you want the **Saved Meals** and **PC Recipes** tabs to appear? They make sense for diary logging, but adding a whole saved meal as a single recipe ingredient is unusual — default would be to hide both in pick mode. ( hide PC recipes and saved meals in this section ) 
2. Should the "Add Ingredient" picker itself also become a centered desktop modal (matching #1), or keep it full-bleed when opened from the editor?( matching #1) 