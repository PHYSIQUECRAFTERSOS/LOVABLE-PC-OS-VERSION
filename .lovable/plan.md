

# Fix: Nutrition Guides Not Showing + Grocery List Generation Failing

## Issues Identified

### Issue 1: Edge function `generate-grocery-list` not deployed
The function returns 404 — it was never deployed. The client sees "Failed to send a request to the Edge Function" because the function doesn't exist on the server. The code itself is correct, it just needs to be deployed (which happens automatically when we touch the file).

### Issue 2: Coach's client workspace (MealPlanTab) still shows PDF upload
The first screenshot shows the coach in the **Client Detail > Meal Plan tab** (`MealPlanTab.tsx`), which still has the full PDF upload section (lines 385-492). This needs to be removed since PDFs are replaced by the Guides system.

### Issue 3: Client guide sections query doesn't filter by coach
`ClientNutritionHub` fetches `nutrition_guide_sections` with only `is_visible = true` — no filter by the client's coach. This means if multiple coaches exist, clients could see guides from the wrong coach. Needs to join through `coach_clients` to get the correct coach.

### Issue 4: Coach Guides tab IS working but the coach was looking at the wrong place
The Nutrition > Guides tab does render `CoachNutritionGuides` correctly. The coach was looking at the client workspace MealPlanTab expecting to see the new system there.

---

## Plan

### Step 1: Deploy the edge function
Add a minor comment to `supabase/functions/generate-grocery-list/index.ts` to trigger redeployment. The code is correct — it reads meal plan items, sends food names to AI for categorization, and upserts into `grocery_lists`.

### Step 2: Remove PDF upload from MealPlanTab
Remove lines 385-492 from `src/components/clients/workspace/MealPlanTab.tsx` — the entire PDF section (upload, viewer, file list). Remove unused PDF-related state variables, imports, and functions (`handlePdfUpload`, `downloadPdf`, `openPdfViewer`, `deletePdf`, `viewingPdf`, `uploads`, `uploading`).

### Step 3: Fix client guide sections query
In `src/components/nutrition/ClientNutritionHub.tsx`, update the `guideSections` query to filter by the client's assigned coach:
```sql
-- Instead of: SELECT * FROM nutrition_guide_sections WHERE is_visible = true
-- Do: First get coach_id from coach_clients, then filter by that coach
```

### Step 4: Add grocery list generation for coach on client workspace
Add a "Generate Grocery List" button to the `MealPlanTab` so coaches can generate the grocery list for a client directly from the client workspace. This calls the same edge function with the client's ID.

### Step 5: Ensure `additional_notes` is per-client
The current `CoachNutritionGuides` treats `additional_notes` as a global template section (same for all clients). Per the user's request, `additional_notes` should be per-client. Move it out of the global guide sections and into the `PhaseInfoEditor` (client-specific section) alongside phase info, since it changes per client.

---

## Files Changed

1. **`supabase/functions/generate-grocery-list/index.ts`** — Trigger redeployment (minor edit)
2. **`src/components/clients/workspace/MealPlanTab.tsx`** — Remove PDF upload section, add coach grocery list generation button
3. **`src/components/nutrition/ClientNutritionHub.tsx`** — Fix guide sections query to filter by assigned coach
4. **`src/components/nutrition/CoachNutritionGuides.tsx`** — Remove `additional_notes` from global sections (it's per-client)
5. **`src/components/nutrition/PhaseInfoEditor.tsx`** — Add `additional_notes` textarea field (per-client, alongside phase info)

## Technical Details

- The edge function code is correct. The `generate-grocery-list` function uses service role key, reads `meal_plans` + `meal_plan_items`, extracts food names, calls Lovable AI (Gemini Flash) with tool calling for structured categorization, and upserts to `grocery_lists`.
- RLS policies are already correct for all three tables.
- The `nutrition_guide_sections` table has a `UNIQUE(coach_id, section_key)` constraint and the upsert uses `onConflict: "coach_id,section_key"` — this is correct for global templates.
- The `client_phase_info` table has `UNIQUE(client_id)` — correct for per-client data.

## Improvements

1. **Coach can generate grocery list from client workspace** — saves the coach from having to log in as client
2. **Per-client additional notes** separated from global templates — matches the real workflow
3. **Coach-filtered guide sections** — prevents cross-coach data leakage in multi-coach setups
