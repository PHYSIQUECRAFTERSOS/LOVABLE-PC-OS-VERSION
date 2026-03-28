# Plan: Premium Visual Guides + Complete Content Pre-population (incl. Macro Cheat Sheet)

## Summary

Three files modified to: (1) redesign `GuideSection.tsx` with a premium gold-accented renderer featuring chevron bullets, numbered step cards, and structured grids, (2) pre-populate ALL guide content from the uploaded images (including the full Macro Cheat Sheet with Protein/Carbs/Fats/Fruits/Vegetables/Spices/Sauces categories) into `CoachNutritionGuides.tsx`, (3) update `ClientNutritionHub.tsx` to show a smooth scrolling feed instead of nested collapsibles. Also adds a `why_macros_matter` section.

---

## Change 1: Premium GuideSection Renderer

**File:** `src/components/nutrition/GuideSection.tsx`

Complete visual redesign of the client-facing guide card:

- Gold (#D4A017) left border accent on each card
- Custom ReactMarkdown component overrides:
  - `li` → gold `ChevronRight` icon pair instead of plain bullets
  - `strong` → gold text color
  - `h2`/`h3` → uppercase with gold underline accent
  - `ol` → numbered step cards with gold number backgrounds
  - `blockquote` → highlighted tip box with gold left border
- Subtle hover glow, clean spacing, premium typography
- Add `sectionKey` prop so the macro cheat sheet section can render a special structured grid layout (categorized cards for Protein, Carbs, Fats, Fruits, Vegetables, Spices, Sauces) instead of plain markdown

---

## Change 2: Pre-populate ALL Guide Content + Add `why_macros_matter`

**File:** `src/components/nutrition/CoachNutritionGuides.tsx`

Add new section `why_macros_matter` (sort_order 2.5, between nutrition_tips and meal_planning). Update CATEGORIES to include it under "Tracking & Planning".

Add `DEFAULT_CONTENT` map. When no existing DB content exists for a section, the textarea pre-fills with this content. Coach reviews and clicks "Save" to persist.

### Full content to pre-populate:

**💧 Water Recommendation:**

- Drink plenty of water, 3-4 liters/day, work up in increments

**☀️ Daily Morning Ritual:**

- 1 TBSP Oraganic Lemon juice + 1 TBSP ACV + 1 TSP Pysillum Husk( meta mucil - if this on your supplement list))> chug 500ml water afterwards 

**📊 Why Are Macros So Important?:**

- Each macro has different functions, structured balance is key, undermining one sacrifices elsewhere (strength, energy, libido)

**📋 Nutrition Tracking Tips:**

- Food scale, weigh cooked (except oatmeal/quinoa dry), prep 3-4 days, stick to one protein/carb/vegetable

**🥗 Meal Planning Recommendations:**

- (Left for coach to fill)

**🍽️ Eating Out Cheat Sheet:**

- Sides :rice (plain), salad (plain no oil/dressing), mashed potatoes (plain) vegetables (plain) 
- All Orders :sauce on side - use sparingly 
- Fats :most foods already have fats( don't worry about this)
- Protein: Chicken( not deep fried), shrimp, extra lean steak, white fish,  bison, tuna, egg whites, turkey, salmon
- "Here's How to Approach It" 3-step numbered guide
- 1)Look for something with protein on the menu( protein list is up above)
- 2) If it comes with a side, see the list above for options to pick from 
- 3)If it comes with a side, ask for sauce on side 

Tip: Can always use the " Meal Scan" AI photo scanner to get a idea of how much calories your meal has when eating out after ordering

**🍕 Eating Out Examples:**

- MCDONALD'S - GRILLED CHICKEN CAESAR SALAD (NO CROUTONS, LIGHT DRESSING)
  GRILLED CHICKEN IS A GREAT LEAN PROTEIN, AND THE SALAD BASE KEEPS IT LOW-CARB.
  -A&W - GRILLED CHICKEN BURGER (NO SAUCE, WRAPPED IN LETTUCE)
  SKIP THE BUN AND SAUCES TO KEEP IT LIGHTER, FOCUSING ON THE GRILLED CHICKEN PATTY.
  -SUBWAY - DOUBLE CHICKEN CHOPPED SALAD (NO CHEESE, OIL, OR HEAVY SAUCES)
  LOAD UP ON VEGETABLES AND ASK FOR DOUBLE CHICKEN TO INCREASE PROTEIN INTAKE.
  -TIM HORTONS - GRILLED CHICKEN WRAP (NO SAUCES, EXTRA CHICKEN IF POSSIBLE)
  OPT FOR EXTRA CHICKEN TO MAKE IT A PROTEIN-PACKED OPTION.
  -BOSTON PIZZA - OVEN-ROASTED SALMON (WITH STEAMED VEGGIES)
  SALMON PROVIDES A GREAT SOURCE OF PROTEIN AND HEALTHY FATS.
  -KELSEY'S - GRILLED CHICKEN BREAST WITH MIXED GREENS
  CUSTOMIZE YOUR MEAL BY CHOOSING GRILLED PROTEIN OPTIONS AND PAIRING THEM WITH VEGGIES.
  -EARLS - CAJUN BLACKENED CHICKEN WITH STEAMED VEGETABLES
  A FLAVORFUL GRILLED CHICKEN DISH THAT'S PROTEIN-FOCUSED WITHOUT HEAVY SAUCES OR SIDES.
  -SWISS CHALET - QUARTER CHICKEN DINNER (WHITE MEAT, NO SKIN, WITH STEAMED VEGETABLES)
  OPT FOR WHITE MEAT AND REMOVE THE SKIN TO KEEP IT LEANER
- THE KEG - BASEBALL TOP SIRLOIN (8 OZ.) WITH ASPARAGUS
  A HIGH-PROTEIN STEAK OPTION PAIRED WITH A VEGGIE SIDE TO BALANCE IT OUT.
  -JACK ASTOR'S - GRILLED CHICKEN POWER BOWL
  LOADED WITH PROTEIN FROM CHICKEN, PLUS FIBER FROM GREENS AND VEGGIES.
  -CHIPOTLE - BURRITO BOWL WITH DOUBLE CHICKEN, NO RICE, EXTRA VEGGIES
  CUSTOMIZE YOUR BOWL FOR A HIGH-PROTEIN, LOW-CARB MEAL BY SKIPPING THE RICE AND ADDING EXTRA CHICKEN.
  -HARVEY'S - GRILLED CHICKEN SANDWICH (LETTUCE WRAP, NO SAUCE)
  KEEP IT LIGHT BY SKIPPING THE BUN AND FOCUSING ON THE LEAN PROTEIN FROM GRILLED CHICKEN
  -PITA PIT - CHICKEN SOUVLAKI PITA (DOUBLE PROTEIN, WHOLE WHEAT PITA)
  OPT FOR DOUBLE PROTEIN AND LOAD IT UP WITH VEGGIES FOR A NUTRITIOUS MEAL.
  -NANDO'S - HALF CHICKEN WITH MIXED VEGETABLES
  FLAME-GRILLED CHICKEN IS PACKED WITH PROTEIN AND PAIRS WELL WITH A SIDE OF VEGGIES.
  -PANERA BREAD - MEDITERRANEAN GRILLED CHICKEN SALAD
  A FRESH SALAD WITH LEAN PROTEIN FROM GRILLED CHICKEN, BALANCED WITH HEALTHY FATS LIKE OLIVE OIL.
  -CACTUS CLUB CAFE - GRILLED CHIMICHURRI CHICKEN
  A FLAVORFUL, HIGH-PROTEIN OPTION, OFTEN SERVED WITH LIGHTER SIDES LIKE STEAMED VEGGIES

**📊 Macro Cheat Sheet (Macro Replacement Chart):**
Full content from the uploaded image — "Replace 1:1 Ratio — Protein > Protein, Carb > Carb, Fat > Fat"

- **Protein:** Chicken Breast, Turkey Breast, Ground Turkey, Egg Whites, Extra Lean Steak, Scallops, Shrimp, White Fish, Ground Bison, Bison Steak, Whey Protein (substitute for 40g of protein powder), Turkey Bacon Canada Style, Fat Free Greek Yogurt, Low Fat / No Fat Cottage Cheese, Ground Turkey
- **Carbs:** Potatoes (White/Russet/Yellow Flesh), Sweet Potatoes, Beans & Lentils, Quinoa, Bulgur, Jasmine Rice/Brown Rice/Basmati Rice/Wild Rice, Baked Sweet Potato Chips
- **Fruits:** Blueberries, Strawberries, Raspberries, Blackberries, Pineapple, Banana, Apple, Orange
- **Vegetables:** Spinach, Carrots, Cauliflower, Green Beans, Cucumbers, Mushrooms, Peppers
- **Fats:** Avocados, Almond Butter, Peanut Butter, Sunflower Butter, Cashew Butter, Eggs (w/ yolk), Nuts (Almonds, Cashews), Flax Seed Oil, Grass Fed Butter or Ghee, Coconut Oil, Oils (Avocado Oil, Olive Oil)
- **Spices:** Salt, Pepper, Garlic Powder, Cinnamon — recommend sticking to these as others can include fillers and cause inflammation and make fat loss harder
- **Sauces:** G Hughes Sugar Free Sauces (BBQ, Thai), Walmart Sugar Free BBQ Sauce, Sriracha, Hot Sauces (Red Franks, Nando's, or any under 10 cal/serving), Fat Free Dressings, Any Sugar Free Sauce (15 cal or under/serving)

---

## Change 3: Smooth Client Feed

**File:** `src/components/nutrition/ClientNutritionHub.tsx`

- Remove nested `Collapsible` wrappers — show all visible guides in a smooth scrollable feed
- Each guide renders as a full-width premium card using the new `GuideSection`
- Pass `sectionKey` prop to `GuideSection` so macro_cheat_sheet renders as a structured grid
- Add subtle CSS fade-in animation (`animate-fade-in` with staggered delays)

---

## Files Modified


| File                                                | Change                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/components/nutrition/GuideSection.tsx`         | Premium visual redesign with gold accents, chevron bullets, structured macro grid |
| `src/components/nutrition/CoachNutritionGuides.tsx` | Add `why_macros_matter`, pre-populate ALL content including macro cheat sheet     |
| `src/components/nutrition/ClientNutritionHub.tsx`   | Remove collapsibles, smooth scrolling feed, pass sectionKey                       |


## No Database Changes Needed

Existing `nutrition_guide_sections` table supports all fields.