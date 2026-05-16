## Goal
Comply with FatSecret's Premier Free tier attribution audit by visibly crediting them across the app and the public site.

## Where the badge will appear
1. **Info page (`/info`)** — in the page footer, subtle, left-aligned, satisfies the "publicly visible on your website without logging in" requirement.
2. **Main Nutrition page header (`/nutrition`)** — small badge inline to the right of the "Nutrition" title (next to the existing action buttons). Visible to clients and coaches.
3. **Every nutrition-related screen** — bottom-left, subtle. Covers:
   - `DailyNutritionLog` (Tracker)
   - `MealPlanBuilder` (Plans)
   - `ClientStructuredMealPlan` (client Meal Plan)
   - `RecipeBuilder` (Recipes)
   - `MicronutrientDashboard` (Micros)
   - `ClientNutritionHub` / `CoachNutritionGuides` (Plan/Guides)
   - `USDAFoodSearch` modal and any food-search/add overlays where FatSecret data shows
   - `ClientNutritionDashboard` summary card

Supplements tab is excluded (FatSecret isn't the source there).

## Implementation
Create one shared component `src/components/nutrition/PoweredByFatSecret.tsx` with two sizes:

- `variant="inline"` — ~20px tall, used next to the Nutrition H1
- `variant="footer"` — ~24px tall, `opacity-70`, bottom-left, used at the bottom of each nutrition view

Component uses FatSecret's officially hosted **horizontal dark PNG** with proper `srcSet` for retina (per their snippet — must not be modified):

```tsx
<a
  href="https://platform.fatsecret.com"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="Nutrition information provided by fatsecret Platform API"
>
  <img
    alt="Nutrition information provided by fatsecret Platform API"
    src="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark.png"
    srcSet="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark@2x.png 2x, https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark@3x.png 3x"
    border={0}
  />
</a>
```

Hot-linking from `platform.fatsecret.com` is what FatSecret instructs (keeps logo current, no asset modification, easy proof of compliance).

### Files touched
- **NEW:** `src/components/nutrition/PoweredByFatSecret.tsx`
- `src/pages/Nutrition.tsx` — render `<PoweredByFatSecret variant="inline" />` in the header row beside the title; wrap tab content in a `relative` container with `<PoweredByFatSecret variant="footer" />` at the bottom of each nutrition TabsContent (except Supplements).
- `src/pages/Info.tsx` — add a `<footer>` section at the bottom with the badge plus a one-line credit: "Nutrition data powered by FatSecret Platform API".
- Each large nutrition sub-component listed above gets a single `<PoweredByFatSecret variant="footer" />` at the bottom of its returned tree (bottom-left, `mt-6`, `opacity-70`).

## Out of scope
- App Store / Google Play listing updates — user is handling those manually.
- Replying to FatSecret's eligibility email — user handles that directly.
- No backend, RLS, or data changes.

## Verification
1. Open `/info` while logged out → footer badge visible, links to platform.fatsecret.com.
2. Log in as client → tap Nutrition → badge visible next to "Nutrition" title and at bottom-left of each nutrition tab.
3. Log in as coach → same placements appear, plus Meal Plans / Recipes / Micros tabs show the footer badge.
4. Take screenshots of `/info` footer + Nutrition header + one sub-screen — these become the proof you reply to FatSecret with.
