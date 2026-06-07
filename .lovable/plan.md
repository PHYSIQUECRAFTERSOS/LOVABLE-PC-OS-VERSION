## Goal

Add a printer icon to three sections that exports a branded **Physique Crafters** PDF of the client's currently assigned plan:

- **Nutrition → Meal Plan tab** — exports BOTH Training Day and Rest Day plans combined
- **Nutrition → Supplements tab** — exports full active supplement stack
- **Training section** — exports every phase, every workout, every exercise (sets × reps × weight/RIR, notes)

Visible to both coaches (on the client they're viewing) and clients (their own plan).

## UX

- A small `Printer` icon button (gold-on-black, lucide `Printer`) in the top-right of each section's header.
- Tap → spinner state ("Generating PDF…") → browser save dialog with filename:
  - `{ClientFirstName}-MealPlan-{YYYY-MM-DD}.pdf`
  - `{ClientFirstName}-Supplements-{YYYY-MM-DD}.pdf`
  - `{ClientFirstName}-TrainingProgram-{YYYY-MM-DD}.pdf`
- Toast on success / error.
- iOS/Android Capacitor: trigger native share sheet so it can be saved to Files or AirDropped.

## PDF Design (consistent across all 3)

```text
┌─────────────────────────────────────────┐
│  ███ PHYSIQUE CRAFTERS                  │  ← Cover page
│                                         │
│       [Section Name]                    │
│       Prepared for: Kevin Wu            │
│       Date: June 7, 2026                │
│       Coach: Aaron                      │
│                                         │
│       physiquecrafters.com              │
└─────────────────────────────────────────┘
```

- Black band header (#0a0a0a) with gold "PHYSIQUE CRAFTERS" wordmark on every page
- Gold accent rule (#D4A017) under section titles
- Clean white body, black text — readable when printed
- Footer: page number + client name + generated date
- Letter size, 1" margins

## Section-by-section content

### Meal Plan PDF
- Cover page
- Section 1: **Training Day** — daily macro targets (cals/P/C/F), then each meal as a table: Meal name → foods (qty + macros per row) → meal totals
- Section 2: **Rest Day** — same structure
- Section 3: **Coach Notes** (if any meal-level notes exist)

### Supplements PDF
- Cover page
- Table per timing slot (Morning / Pre-workout / Post-workout / Evening / etc.): Name | Dose | Form | Notes
- "Why this stack" coach notes section if present

### Training Program PDF
- Cover page
- One section per **Phase** (Phase 1, Phase 2…): phase name, duration, notes
- Within each phase, one block per **Workout** ("Day 1: Push", etc., skip accessory "Day N:" — show clean name)
- Workout block = table of exercises: Exercise | Sets | Reps | Target Weight | RIR | Tempo | Rest | Notes
- Accessory workouts labeled "Accessory — [name]" not "Day N"
- Page break between phases

## Technical approach

**Library:** `jspdf` + `jspdf-autotable` (already small, works client-side, no server roundtrip).
- Pure client-side generation → instant, no edge function cost
- `jspdf-autotable` handles long tables with auto page breaks
- Capacitor `@capacitor/filesystem` + `@capacitor/share` for native save on mobile (fallback to browser blob download on web)

**New files:**
- `src/utils/pdf/brandedPdf.ts` — shared PDF builder (cover page, header band, footer, palette tokens, file saving / native share helper)
- `src/utils/pdf/exportMealPlanPdf.ts` — fetches both day-type meal plans + meal_plan_items for `clientId`, builds PDF
- `src/utils/pdf/exportSupplementsPdf.ts` — fetches supplement plan + items for `clientId`
- `src/utils/pdf/exportTrainingPdf.ts` — fetches active program → phases → program_workouts → workouts → workout_exercises (and sets/reps/weight/RIR) for `clientId`
- `src/components/common/ExportPdfButton.tsx` — reusable gold printer-icon button with loading state and toast

**Edits:**
- `src/pages/Nutrition.tsx` — add `<ExportPdfButton kind="meal-plan" clientId={user.id} />` in the Meal Plan tab header and `kind="supplements"` in the Supplements tab header
- `src/components/clients/workspace/MealPlanTab.tsx` — same buttons (coach side, pass viewed client's id)
- `src/components/nutrition/ClientSupplementPlan.tsx` — supplements export button in its header
- `src/components/clients/workspace/TrainingTab.tsx` and `src/components/clients/workspace/training/ClientProgramTwoPane.tsx` — training export button
- `src/pages/Training.tsx` (or equivalent client training entry) — same button for client-side

**Data fetching:** all queries respect existing RLS — coach sees only their assigned clients, client sees only own data. No new policies needed.

**No backend / no migrations.** All client-side. No new secrets.

## What's NOT in scope

- Exporting master library templates (only the client's assigned plan)
- Customizing brand colors / logo per coach (single Physique Crafters brand)
- Editing PDF after export
- Scheduling automated email delivery of the PDF

## Verification

- Coach view: open a client, export each of the 3 PDFs, open in viewer, confirm content matches what's on screen
- Client view: same on their own dashboard
- Mobile iOS PWA: confirm native share sheet opens
- Empty states: client with no meal plan / no supplements / no program → button is disabled with tooltip "No plan to export yet"
