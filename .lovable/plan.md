# Plan: Fix Client Meal Plan Sync + Duplicate Day Pills + PDF Workaround

## Root Causes Found

**1. Client sees old meal plan + duplicate "Training Day" pills**
`src/hooks/useMealPlanTracker.ts` (line 162-177) fetches the client's meal plans but **does not filter `archived_at IS NULL`**. Every plan ever assigned (including archived ones from the new Master Library "archive-and-swap" flow) keeps appearing. Result:
- Old plan still visible after a new assign.
- Two "Training Day" pills (old + new, both `day_type='training'`).
- The "Daily Total" / macros row also pulls from the wrong (old) plan.

**2. Three "Training Day" indicators on the Tracker tab** (`DailyNutritionLog.tsx`)
- A "Training Day" pill inside the macro-ring card (line ~631).
- Two pills below it (one per assigned plan — same bug as above, will become one once #1 is fixed).
- After fix #1 there will still be **two**: the pill inside the ring card + the single plan pill below. User wants only **one**.

**3. Master Library copy can create duplicates**
`MealPlanTemplateLibrary.tsx` `handleCopyToClient` archives existing plans, but if the template itself contains multiple days (Training + Rest), the assign creates one `meal_plans` row with `day_type='training'` (or whatever was picked) regardless. That's fine — duplicate pills are purely the archive-filter bug above.

**4. PDF "rebuild" concern**
The current `exportMealPlanPdf` is **pure client-side jsPDF** — no native build required, the PDF already generates in-browser and downloads via `savePdf` → `Blob` URL. On iOS PWA / Capacitor the `Blob` download may silently fail (Safari restriction), which is likely what the user means by "needs a full build." Workaround: add an **"Email me the PDF"** option that uploads the generated PDF to storage and triggers an edge function to email the client a download link — no native rebuild.

## Changes

### A. Filter archived plans everywhere on the client side
- `src/hooks/useMealPlanTracker.ts` — add `.is("archived_at", null)` to the `meal_plans` query.
- Drop `staleTime` to 0 (or invalidate on assign) so a freshly assigned plan shows up immediately when the client refreshes.
- Audit other reads of `meal_plans` for `client_id = X` and add the same archive filter where missing:
  - `src/utils/pdf/exportMealPlanPdf.ts`
  - `src/components/nutrition/ClientStructuredMealPlan.tsx` (via hook — already covered)
  - Any other consumer surfaced by a quick `rg` pass.

### B. Collapse the Tracker "Training Day" indicators to one
In `DailyNutritionLog.tsx`:
- Remove the inline "Training Day / Rest Day" pill rendered **inside** the macro-ring card (line ~631).
- Keep the single row of day-type pills below the card (one button per available plan), restoring the original aesthetic.

### C. Master Library assign — invalidate client query
After a successful copy in `MealPlanTemplateLibrary.tsx`, call `queryClient.invalidateQueries({ queryKey: ["client-all-meal-plans", clientId] })` so the client's view refreshes the next time they open Nutrition (and so the coach preview is fresh too).

### D. PDF workaround — "Email PDF" option (no native rebuild)
- Extend `ExportPdfButton` with a dropdown: **Download** (existing) and **Email to me**.
- "Email to me" path:
  1. Generate the same jsPDF Blob in-browser (reuse `exportMealPlanPdf` / `exportSupplementsPdf` / `exportTrainingPdf`, return the Blob instead of saving).
  2. Upload the Blob to a new Storage bucket `plan-pdfs` (private, signed-url access) at path `{userId}/{kind}-{timestamp}.pdf`.
  3. Create a 7-day signed URL.
  4. Call existing transactional email pipeline (`send-transactional-email`) with a new template `plan-pdf-link` that emails the logged-in user a download link.
- No changes to the iOS/Capacitor build are required — pure web + edge function.

## Technical Notes
- Archive filter is a one-line query change; the real fix.
- `meal_plans.archived_at` and `archive_group_id` columns already exist (used by `clientPlanArchive.ts`) — no migration needed.
- Storage bucket `plan-pdfs` needs RLS: insert/select restricted to `auth.uid() = owner`.
- Email template can reuse the existing transactional-email scaffold; one new `.tsx` template under `supabase/functions/_shared/transactional-email-templates/`.

## Out of Scope
- Re-architecting how meal plans are stored.
- Changing the Master Library archive-and-swap logic itself (it works; the client view just wasn't honoring `archived_at`).
- Any iOS / Capacitor native code.

## One Question Before I Build
**For the "Email PDF" workaround — do you want it to (a) replace the current Download button entirely on mobile, or (b) be an additional option alongside Download (dropdown / second button)?** I'd recommend (b) so desktop coaches keep the instant download.
