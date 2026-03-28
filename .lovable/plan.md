

# Plan: Add Guides Tab to Master Libraries + Fix Client Plan Editing

## Problem

1. `CoachNutritionGuides` component exists but is NOT wired into the Master Libraries page — there's no "Guides" tab
2. The client PlanTab shows "No guide sections configured yet. Go to Master Libraries → Guides" but that destination doesn't exist
3. The PlanTab already has override/customize logic, but it only works if guide sections exist in the DB (created via the Nutrition page's hidden coach plan tab)

## Solution

### Change 1: Add "Guides" tab to Master Libraries

**File:** `src/pages/MasterLibraries.tsx`

- Import `CoachNutritionGuides` and `BookOpen` icon
- Change the TabsList from `grid-cols-6` to `grid-cols-7`
- Add a new `TabsTrigger` for `"guides"` with BookOpen icon
- Add a `TabsContent` for `"guides"` that renders `<CoachNutritionGuides />`
- This gives coaches a dedicated place to create/edit/preview all master guide sections

### Change 2: Fix the empty-state link in PlanTab

**File:** `src/components/clients/workspace/PlanTab.tsx`

- Update the empty state message to include a clickable link/button that navigates to `/libraries` with the guides tab active (using `useNavigate` + query param or just a link)
- Add `useNavigate` import

### Change 3: Improve PlanTab guide editing UX

**File:** `src/components/clients/workspace/PlanTab.tsx`

Currently the override system only shows sections that are already visible (have content in `nutrition_guide_sections`). Improvements:
- When no guides exist, show the link to Master Libraries → Guides (already done above)
- When guides DO exist, the current customize/hide/reset flow is already functional — no changes needed to override logic
- Add a "Refresh" button next to the Nutrition Guides header so after creating guides in Master Libraries, the coach can refresh without leaving the page

### Change 4: Update Daily Habits emoji

**File:** `src/components/nutrition/CoachNutritionGuides.tsx`

- Change `daily_ritual` title from "🌅 Daily Morning Ritual" to "☀️ Daily Morning Ritual" (matching the iOS sun emoji fix from the supplement plan work)
- Update CATEGORIES label from "🌅 Daily Habits" to "☀️ Daily Habits"

**File:** `src/components/clients/workspace/PlanTab.tsx`
- Same emoji update in the CATEGORIES constant

**File:** `src/components/nutrition/ClientNutritionHub.tsx`
- Same emoji update in its CATEGORIES constant

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/MasterLibraries.tsx` | Add Guides tab with `CoachNutritionGuides` |
| `src/components/clients/workspace/PlanTab.tsx` | Add navigate link in empty state, refresh button, emoji fix |
| `src/components/nutrition/CoachNutritionGuides.tsx` | Emoji fix |
| `src/components/nutrition/ClientNutritionHub.tsx` | Emoji fix |

## No Database Changes Needed

The `nutrition_guide_sections` and `client_guide_overrides` tables already exist with proper RLS policies.

---

## Improvements

1. **Direct link from PlanTab**: The empty state will link directly to Master Libraries → Guides tab so coaches don't have to hunt for it
2. **Refresh button**: After setting up guides in Master Libraries, coaches can refresh the PlanTab guide list without navigating away
3. **Consistent emojis**: ☀️ across all guide-related components
4. **Single source of truth**: Master Libraries becomes the central hub for all guide management, while client PlanTab handles per-client overrides only

