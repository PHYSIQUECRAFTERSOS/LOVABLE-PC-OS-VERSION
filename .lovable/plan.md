

# Nutrition "Plan" Hub: AI Grocery List + In-App Guides (Replace PDF)

## What We're Building

Transform the client "Plan" tab from a PDF viewer into a rich, interactive hub with two major pieces:

1. **AI-Generated Grocery List** — pulled from the client's meal plan, categorized, with persistent checkboxes
2. **Nutrition Guides** — coach-managed content sections replacing the PDF (eating out examples, cheat sheet, water recommendations, daily morning ritual, nutrition tips, phase info, macro cheat sheet, additional notes)

The coach "Upload" tab changes to a **Guides Editor** where the coach writes/updates content once for all clients. PDF upload functionality is removed.

---

## Database Changes (3 new tables, 1 edge function)

### Table: `grocery_lists`
Stores the AI-generated grocery list per client, persisted so coach can see it too.

```sql
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT now(),
  items JSONB NOT NULL DEFAULT '[]',
  -- items: [{category: "Protein", name: "Chicken Breast", checked: false}, ...]
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
-- Client can read/update their own; coach can read their clients'
```

### Table: `nutrition_guide_sections`
Coach-managed content sections (same for all clients). One row per section.

```sql
CREATE TABLE IF NOT EXISTS nutrition_guide_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  section_key TEXT NOT NULL, -- e.g. 'eating_out_examples', 'water_recommendation', 'daily_ritual', 'nutrition_tips', 'macro_cheat_sheet', 'phase_info', 'additional_notes', 'eating_out_cheat_sheet'
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coach_id, section_key)
);
ALTER TABLE nutrition_guide_sections ENABLE ROW LEVEL SECURITY;
```

### Table: `client_phase_info`
Per-client phase information (since this varies per client).

```sql
CREATE TABLE IF NOT EXISTS client_phase_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  current_phase_name TEXT,
  current_phase_description TEXT,
  next_phase_name TEXT,
  next_phase_description TEXT,
  coach_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE client_phase_info ENABLE ROW LEVEL SECURITY;
```

### Edge Function: `generate-grocery-list`
Takes a client_id, reads their `meal_plan_items` from all active plans, sends food names to Lovable AI (Gemini Flash) with prompt to categorize into Protein, Carbs, Fats, Vegetables, Fruits. Returns structured JSON. Upserts into `grocery_lists`.

---

## Coach Side Changes

### Replace `CoachMealPlanUpload` with `CoachNutritionGuides`

New component with two sub-sections:

**1. Guide Sections Editor**
- Rich text cards for each section: Eating Out Examples, Eating Out Cheat Sheet, Water Recommendation, Daily Morning Ritual, Nutrition Tracking Tips, Macro Cheat Sheet, Additional Notes
- Each card has a title, textarea for content (Markdown-friendly), visibility toggle, and save button
- Pre-seeded with default content from the uploaded images/PDF on first use
- Reorderable via sort_order

**2. Phase Info Editor (per-client)**
- Client selector dropdown
- Fields: Current Phase Name, Current Phase Description, Next Phase Name, Next Phase Description, Coach Notes
- Saves to `client_phase_info`

### Tab rename
- Coach tab "Upload" becomes "Guides"

---

## Client Side Changes

### Replace `ClientMealPlanView` with `ClientNutritionHub`

The client "Plan" tab becomes a scrollable hub with these sections:

**1. Grocery List (top)**
- "Generate Grocery List" button that calls the edge function
- Categorized checklist (Protein Sources, Carb Sources, Fats, Vegetables, Fruits)
- Checkboxes persist to DB -- client checks items off as they shop
- "Reset List" button to uncheck all
- Shows last generated date

**2. Phase Info Card**
- Current Phase name + description
- Next Phase name + description  
- Coach notes

**3. Guide Sections (scrollable cards)**
- Water Recommendation
- Daily Morning Ritual
- Nutrition Tracking Tips
- Eating Out Cheat Sheet
- Eating Out Examples
- Macro Cheat Sheet
- Additional Notes
- Each rendered as a styled card with Markdown-like content
- Only shows sections marked `is_visible` by coach

---

## Files to Create/Edit

### New Files
1. `supabase/functions/generate-grocery-list/index.ts` — Edge function using Lovable AI
2. `src/components/nutrition/ClientNutritionHub.tsx` — Client Plan tab replacement
3. `src/components/nutrition/GroceryList.tsx` — Grocery list with checkboxes
4. `src/components/nutrition/CoachNutritionGuides.tsx` — Coach guide editor
5. `src/components/nutrition/PhaseInfoEditor.tsx` — Per-client phase editor
6. `src/components/nutrition/GuideSection.tsx` — Reusable guide section card

### Modified Files
1. `src/pages/Nutrition.tsx` — Swap `ClientMealPlanView` → `ClientNutritionHub`, `CoachMealPlanUpload` → `CoachNutritionGuides`, rename tab labels
2. Database migration — 3 new tables + RLS policies

### Removed (replaced)
- `ClientMealPlanView` component no longer rendered in the Plan tab (kept in codebase but unused)
- `CoachMealPlanUpload` component no longer rendered (kept but unused)

---

## Edge Function: `generate-grocery-list`

Uses Lovable AI (Gemini Flash) with this approach:
1. Fetch all `meal_plan_items` for the client's active plans
2. Extract unique food names
3. Send to AI: "Categorize these foods into Protein Sources, Carbohydrate Sources, Fat Sources, Vegetables, Fruits. Return JSON array."
4. Upsert the result into `grocery_lists`
5. Return the categorized list

---

## Suggestions for What's Missing

Based on the PDF analysis, here's what the app already covers vs. what we're adding:

| PDF Section | Already in App? | Action |
|---|---|---|
| Client Info / Goals | Yes (onboarding + profile) | No change |
| Supplement Stack | Yes (Supps tab) | No change |
| Calories & Macros | Yes (tracker + targets) | No change |
| Meal Plans (structured) | Yes (My Plan tab) | No change |
| Training Overview | Yes (Training page) | No change |
| Cardio Routine | Yes (CardioManager) | No change |
| Grocery List | No | **Adding** |
| Water Recommendation | No | **Adding** |
| Daily Morning Ritual | No | **Adding** |
| Nutrition Tracking Tips | No | **Adding** |
| Eating Out Examples | No | **Adding** |
| Eating Out Cheat Sheet | No | **Adding** |
| Macro Cheat Sheet | No | **Adding** |
| Current/Next Phase Info | No | **Adding** |
| Additional Notes | No | **Adding** |
| Weekly Check-in Overview | Yes (check-in system) | No change |
| Important Links / Videos | Partially (onboarding) | Could add to guides |
| Macro Replacement Chart | No | **Adding as Macro Cheat Sheet** |

