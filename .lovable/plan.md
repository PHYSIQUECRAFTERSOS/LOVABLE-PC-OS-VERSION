

# Plan: Per-Client Guide Overrides, Category Tags, and Rich Text Support

## Summary

Three enhancements to the nutrition guides system: (1) per-client overrides so a coach can customize a specific guide section for one client while inheriting the rest from the master template, (2) category grouping of guide sections for better organization, and (3) basic markdown/rich text support for guide content.

---

## Database Changes

### New table: `client_guide_overrides`
Stores per-client content overrides for specific guide sections. When a client has an override for a section_key, it replaces the master template content for that client only.

```sql
CREATE TABLE IF NOT EXISTS client_guide_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN DEFAULT FALSE, -- coach can hide a section for this client
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, section_key)
);
ALTER TABLE client_guide_overrides ENABLE ROW LEVEL SECURITY;
-- RLS: coach can manage overrides for their clients, client can read their own
```

### Add `category` column to `nutrition_guide_sections`
```sql
ALTER TABLE nutrition_guide_sections ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
```

Categories will be: `hydration`, `daily_habits`, `tracking`, `eating_out`, `reference` — mapped from existing section_keys via an UPDATE statement.

---

## Change 1: Per-Client Guide Overrides

### Coach side — `PlanTab.tsx`
Currently shows guide sections as read-only or renders `CoachNutritionGuides`. Instead, each guide section in the Plan tab will show:
- The master template content (greyed out, as default)
- A "Customize for this client" toggle per section
- When toggled on: an editable text area that saves to `client_guide_overrides`
- A "Hide for this client" option (sets `is_hidden = true`)
- A "Reset to default" button to delete the override

### Client side — `ClientNutritionHub.tsx` and `GuideSection.tsx`
- After fetching `nutrition_guide_sections` from the coach, also fetch `client_guide_overrides` for the current user
- For each section: if an override exists and `is_hidden = true`, skip it; if override has content, use override content/title instead of master; otherwise use master

---

## Change 2: Guide Categories/Tags

### Category mapping
| Category | Sections |
|----------|----------|
| 💧 Hydration | water_recommendation |
| 🌅 Daily Habits | daily_ritual |
| 📋 Tracking & Planning | nutrition_tips, meal_planning |
| 🍽️ Eating Out | eating_out_cheat_sheet, eating_out_examples |
| 📊 Reference | macro_cheat_sheet |

### Coach side — `CoachNutritionGuides.tsx`
- Group guide section cards by category with collapsible category headers
- Each category has a label and icon
- Sections within a category remain individually toggleable/editable

### Client side — `ClientNutritionHub.tsx`
- Group rendered guide sections by category with category headers
- Collapsed by default with tap-to-expand for cleaner mobile UX

---

## Change 3: Rich Text / Markdown Support

### Approach
Use a lightweight markdown renderer (the project can use a simple custom parser or `react-markdown` — since `react-markdown` is a common dependency, we'll add it). This avoids building a full WYSIWYG editor while giving coaches formatting power.

### Coach side — All guide textareas
- Add a small toolbar above each textarea with buttons: **Bold**, *Italic*, `• List`, `## Header`
- Buttons insert markdown syntax at cursor position (e.g., wraps selected text in `**`)
- Show a "Preview" toggle next to each section that renders the markdown
- Placeholder text updated: "Supports **bold**, *italic*, - bullet lists, ## headers"

### Client side — `GuideSection.tsx`
- Replace the plain `whitespace-pre-wrap` div with a markdown renderer
- Style the rendered HTML with Tailwind prose classes (`.prose .prose-sm .prose-invert`)

### Files affected
| File | Change |
|------|--------|
| `src/components/nutrition/GuideSection.tsx` | Render markdown instead of plain text |
| `src/components/nutrition/CoachNutritionGuides.tsx` | Add category grouping, markdown toolbar, preview toggle |
| `src/components/clients/workspace/PlanTab.tsx` | Add per-client override UI per section |
| `src/components/nutrition/ClientNutritionHub.tsx` | Fetch overrides, merge with master, group by category |
| `src/components/nutrition/RichTextToolbar.tsx` | New — reusable markdown toolbar component |
| Migration SQL | New table `client_guide_overrides`, add `category` column |
| `package.json` | Add `react-markdown` dependency |

---

## Technical Details

### Override merge logic (client side)
```text
for each master guide section:
  1. check client_guide_overrides for matching section_key
  2. if override exists and is_hidden → skip section
  3. if override exists with content → use override title/content
  4. else → use master template title/content
```

### Markdown toolbar implementation
Simple button bar that inserts markdown tokens around selected text in the textarea. No heavy editor library needed — just `textarea.selectionStart/End` manipulation.

### Category grouping data structure
```typescript
const CATEGORIES = [
  { key: "hydration", label: "💧 Hydration", sections: ["water_recommendation"] },
  { key: "daily_habits", label: "🌅 Daily Habits", sections: ["daily_ritual"] },
  { key: "tracking", label: "📋 Tracking & Planning", sections: ["nutrition_tips", "meal_planning"] },
  { key: "eating_out", label: "🍽️ Eating Out", sections: ["eating_out_cheat_sheet", "eating_out_examples"] },
  { key: "reference", label: "📊 Reference", sections: ["macro_cheat_sheet"] },
];
```

This is defined in code (not DB-driven) for simplicity, with the DB `category` column as a backup/future use.

