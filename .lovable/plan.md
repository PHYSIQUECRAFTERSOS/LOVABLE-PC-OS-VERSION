

# Coach Client Workspace: Grocery List, Supplements Tab, and Plan Tab

## What's Being Built

Three additions to the coach's client workspace (`ClientDetail.tsx`):

1. **Full Grocery List in Meal Plan tab** — After generating, show the complete categorized grocery list with edit/delete capabilities for individual items
2. **New "Supps" tab** — Shows the client's assigned supplement plan (from Master Libraries) with full details and timing
3. **New "Plan" tab** — Shows/edits per-client nutrition guides (phase info, additional notes, guide sections) directly from the client workspace

---

## Plan

### Step 1: Create `CoachGroceryList` component

New file: `src/components/clients/workspace/CoachGroceryList.tsx`

- Accepts `clientId` prop
- Fetches `grocery_lists` where `client_id = clientId` (same query as `GroceryList.tsx` but using `clientId` instead of `user?.id`)
- Shows full categorized list with checkboxes (same visual as client's `GroceryList`)
- Adds **inline edit** — tap item name to edit, save on blur/enter
- Adds **delete** — small trash icon per item, removes from the JSON array and updates
- Adds **Generate/Regenerate** button calling the same edge function with `client_id: clientId`
- All mutations update the `items` JSON column on `grocery_lists` (same pattern as existing `GroceryList.tsx`)

### Step 2: Embed `CoachGroceryList` into `MealPlanTab`

In `src/components/clients/workspace/MealPlanTab.tsx`:
- Replace the current simple "Generate Grocery List" button card (lines 326-347) with the full `CoachGroceryList` component
- Remove the `handleGenerateGroceryList` function and `generatingGrocery` state (moved into the new component)

### Step 3: Add "Supps" tab to `ClientDetail.tsx`

- Import `ClientSupplementPlan` from `@/components/nutrition/ClientSupplementPlan`
- Import `Pill` icon from `lucide-react`
- Add `{ value: "supps", label: "Supps", icon: Pill }` to `tabItems` array (after "mealplan")
- Add `<TabsContent value="supps"><ClientSupplementPlan clientId={clientId!} /></TabsContent>`
- `ClientSupplementPlan` already accepts an optional `clientId` prop and works for coach viewing — it fetches the client's active assignment, plan items, master supplements, overrides, and logs

### Step 4: Add "Plan" tab to `ClientDetail.tsx`

New file: `src/components/clients/workspace/PlanTab.tsx`

- Accepts `clientId` prop
- **Phase Info section**: Loads and edits `client_phase_info` for this specific client (same fields as `PhaseInfoEditor` but pre-scoped to `clientId` — no client dropdown needed)
- **Additional Notes section**: Editable textarea for `additional_notes` field
- **Guide Sections preview**: Read-only view of the coach's global guide sections from `nutrition_guide_sections` so the coach can see what the client sees
- Includes a link/note: "Edit global guide templates in Nutrition > Guides"

Add to `ClientDetail.tsx`:
- Import `PlanTab` and `BookOpen` icon
- Add `{ value: "plan", label: "Plan", icon: BookOpen }` to `tabItems` (after "supps")
- Add `<TabsContent value="plan"><PlanTab clientId={clientId!} /></TabsContent>`

### Step 5: Client-side supplement visibility

The client already has a "Supps" tab in `Nutrition.tsx` (line 48-51) which renders `SupplementLogger`. That component checks for `hasAssignedPlan` and renders `ClientSupplementPlan` when a plan is assigned. This flow already works — no changes needed. The issue was the coach couldn't see it from the client workspace, which Step 3 fixes.

---

## Files Changed

1. **`src/components/clients/workspace/CoachGroceryList.tsx`** (NEW) — Full grocery list viewer/editor for coaches
2. **`src/components/clients/workspace/MealPlanTab.tsx`** — Replace generate button with `CoachGroceryList`
3. **`src/components/clients/workspace/PlanTab.tsx`** (NEW) — Per-client phase info + guide preview
4. **`src/pages/ClientDetail.tsx`** — Add "Supps" and "Plan" tabs

## Technical Details

- `CoachGroceryList` reads/writes the same `grocery_lists` table and `items` JSON column. Edit/delete are optimistic updates to the JSON array, same pattern as the client's `GroceryList.tsx`
- RLS on `grocery_lists` already allows coaches to read/write for their clients (coach role check)
- `ClientSupplementPlan` already handles the `clientId` prop — it fetches `client_supplement_assignments`, `supplement_plan_items`, `master_supplements`, and `client_supplement_overrides`
- The "Plan" tab reuses the same Supabase queries as `PhaseInfoEditor` but scoped to a single client instead of requiring a dropdown selector

