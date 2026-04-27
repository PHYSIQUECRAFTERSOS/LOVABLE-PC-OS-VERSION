## Goals

1. When importing a meal plan PDF in Master Libraries, **auto-detect each day** as `training` or `rest` so the resulting template carries one record per day type with the correct `day_type` / `day_type_label` on each day inside `meal_plan_days`.
2. Inside the **Meal Plan Builder**, add a **"Copy this day to client"** button on each day card that copies just that day into a chosen client's matching slot (Training Day or Rest Day plan), with single-client and multi-client modes plus a "replace existing?" confirmation.
3. Make sure the client-facing **Training Day / Rest Day tabs** light up correctly once the template's days are tagged, with no UX changes needed there (they already key off `day_type`).

## Why one template, not two

You picked "one template with two days inside." That matches the existing schema: `meal_plans` has one row, `meal_plan_days` carries the `day_type` per day, and `MealPlanTab` (client workspace) + `ClientStructuredMealPlan` (client-facing) already pivot off `day_type === 'training' | 'rest'`. The library card stays a single tile that you can "Copy from Client" or assign to a client; nothing about the existing import → review flow has to fork.

The fix is therefore additive:
- Tag each `meal_plan_days` row with the right `day_type` during import.
- Make Builder day cards aware of that tag and offer a per-day "send to client" action.

---

## Diagnostic findings

- **Edge function** (`supabase/functions/ai-import-processor/index.ts`, line 437–464): The meal extraction prompt currently returns `day_label` only, with no `day_type` field, so the saver has nothing to key off.
- **Client save** (`src/components/import/AIImportModal.tsx`, line 458–470): Day type is just a slug of the label (`"Workout Day" → "workout_day"`). That doesn't match the enum the rest of the app uses (`training` | `rest` | `all_days`), so the day never lights up in the Training/Rest pills on `MealPlanTab.tsx`.
- **Schema confirmation**: `meal_plans` has both `day_type` and `day_type_label`; `meal_plan_days` has `day_type`. No migration needed.
- **Client tabs** (`ClientStructuredMealPlan.tsx`, line 85–90; `MealPlanTab.tsx`, line 44–46): Already filter on `day_type === 'training'` / `'rest'`. As soon as the import writes the right values, the tabs work.
- **No regression risk to AI Import workout fix or the filename sanitization fix** — both are in different code paths.

---

## Phase 1 — Auto-classify days during meal-plan import

### 1a. Edge function (`supabase/functions/ai-import-processor/index.ts`)
Update the meal extraction prompt (line ~437) so the model returns a `day_type` per day:
```jsonc
{
  "plan_name": "string",
  "days": [
    {
      "day_label": "string (e.g. 'Workout Day', 'Rest Day', 'Day 1')",
      "day_type": "training | rest | all_days",   // NEW
      "meals": [ ... ]
    }
  ]
}
```
Add explicit detection rules in the prompt:
- Contains `workout`, `training`, `lift`, `gym`, `high carb`, `high-carb`, `on-day` → `training`
- Contains `rest`, `non-training`, `non-workout`, `off`, `off-day`, `recovery`, `low carb`, `low-carb` → `rest`
- Otherwise: if exactly two days are present, default the first to `training` and the second to `rest`. If only one day, use `all_days`.

### 1b. Client save (`src/components/import/AIImportModal.tsx`, `saveMealPlan`)
Replace the brittle slug logic (line 458–470) with a real classifier that runs on whatever the model returned, plus a fallback for older extractions:

```ts
function classifyDayType(label: string, idx: number, total: number, hint?: string) {
  const fromModel = (hint || '').toLowerCase().trim();
  if (fromModel === 'training' || fromModel === 'rest' || fromModel === 'all_days') return fromModel;
  const l = (label || '').toLowerCase();
  if (/\b(rest|non[-\s]?training|non[-\s]?workout|off|recovery|low[-\s]?carb)\b/.test(l)) return 'rest';
  if (/\b(workout|training|lift|gym|high[-\s]?carb|on[-\s]?day)\b/.test(l)) return 'training';
  if (total === 2) return idx === 0 ? 'training' : 'rest';
  return 'all_days';
}
```

Use that to set both:
- `meal_plan_days.day_type` (the slug-style enum)
- `meal_plans.day_type` and `day_type_label` — but only when the import produced exactly **one** classified day type. If the template contains both a training and a rest day, leave `meal_plans.day_type` as `null` so it shows up as a generic two-day template in the library and slots into either pill on assignment. (This matches how `MealPlanTemplateLibrary.tsx` already treats `null` / `'all_days'`.)

### 1c. Persistence guard
After classification, if both days resolved to the same type (e.g. both `training`), force the second to `rest`. Logged behind the existing `VITE_DEBUG_AI_IMPORT` flag so we can see the classification trail.

---

## Phase 2 — "Copy this day to client" inside Meal Plan Builder

### 2a. New action on each day card (`src/components/nutrition/MealPlanBuilder.tsx`)
On every day card header, add a new button next to the existing day controls:
- **"Copy to Client"** — opens a small dialog.

### 2b. New dialog: `CopyDayToClientDialog`
Lives in `src/components/nutrition/CopyDayToClientDialog.tsx`. Props: `day: DayType`, `dayTypeLabel`, `open`, `onOpenChange`.

UI:
- **Mode toggle**: Single client · Multiple clients (segmented control).
- **Client picker**: reuses `SearchableClientSelect` (`mem://ui/components/searchable-client-select`). In multi-client mode, switches to a checkbox list of active coach clients.
- **Target slot preview**: shows `→ Training Day plan` or `→ Rest Day plan` based on the day's `day_type`. If the day's type is `all_days`, prompt the coach to pick which slot.
- **Conflict pre-check**: query `meal_plans` for each chosen client where `day_type` matches and `is_template = false`. If any exist, show a confirmation row per client: "Replace existing Training Day plan?" (you picked "Confirm and replace").
- **Action button**: "Copy to N client(s)" — runs the writes.

### 2c. Write logic (one transaction-style sequence per client)
For each target client:
1. Find existing `meal_plans` row with the same `day_type` (`training` or `rest`) and `client_id = target` and `is_template = false`.
2. If exists → delete the old plan (cascades to `meal_plan_days` and `meal_plan_items` via existing FKs; verify in diagnostic before delete).
3. Insert a new `meal_plans` row: `coach_id = me`, `client_id = target`, `is_template = false`, `name = <current builder day name or template name>`, `day_type` + `day_type_label` set.
4. Insert one `meal_plan_days` row for that day with the same `day_type`.
5. Re-insert all `meal_plan_items` from the source day, mapping `food_item_id` 1:1 (no recalculation, no changes to gram amounts, fully respects existing meal-plan-math integrity).
6. Show a single toast with success/failure counts.

### 2d. State refresh
After success, dispatch the existing `meal-plan-updated` custom event (or invalidate the React Query keys used by `MealPlanTab.tsx` and `ClientStructuredMealPlan.tsx`) so a coach with the client workspace open in another tab sees the update without a hard refresh.

---

## Phase 3 — Verification

1. **Library import**: Re-run the AI Import on `[bi weekly] Jose Lopez April 9 2026.pdf` from Master Libraries → Meals. Expected: one library template with two days inside, day 1 tagged `training`, day 2 tagged `rest`.
2. **Assign to client**: Use the existing "Copy from Client" / library assign flow on the Jose Lopez workspace and confirm both Training Day pill and Rest Day pill light up with the right plan card.
3. **Per-day copy**: Open the Meal Plan Builder on any template, click "Copy to Client" on the Rest Day card → pick Jose Lopez → confirm replace → check his workspace shows the new Rest Day plan and Training Day stayed untouched.
4. **Multi-client copy**: Same flow with three clients selected, including one client who already has a Rest Day plan → verify the conflict prompt appears once with the affected client name.
5. **Client view**: Sign in as Jose → Nutrition → Plan tab → confirm Training/Rest pills both work and the auto "Today is a Training/Rest Day" hint resolves correctly via the existing `calendar_events` lookup in `ClientStructuredMealPlan.tsx`.
6. **No regression**: Re-run an existing supplement and workout import to confirm those flows are unchanged.

---

## Non-negotiables (preserved)

- No RLS changes on `meal_plans`, `meal_plan_days`, `meal_plan_items`.
- No "Track Water" introduced.
- Coach Authority: existing client plans only get replaced when the coach explicitly confirms the prompt.
- All gram amounts and macros copied verbatim — no recalculation drift (`mem://features/nutrition/meal-plan-math-integrity`).
- All dates use `getLocalDateString()` if they need to surface anywhere (none do in this flow).
- Performance: each per-client copy is one delete + three inserts; multi-client mode batches sequentially with a progress indicator (matches existing import progress UX).

## Files touched

1. `supabase/functions/ai-import-processor/index.ts` — meal extraction prompt
2. `src/components/import/AIImportModal.tsx` — `classifyDayType` + persistence
3. `src/components/nutrition/MealPlanBuilder.tsx` — new "Copy to Client" button on day cards
4. `src/components/nutrition/CopyDayToClientDialog.tsx` — **new file**

## Out of scope (call out for later)

- Splitting templates into truly separate library cards (we picked "one template, two days" — flagging only because the alternative remains an option if the library ever needs to filter library tiles by `day_type`).
- Tempo / RPE / RIR / AMRAP markers from training PDFs (still queued from the rest-timer prompt's consultant recommendations).
- Bulk PDF import (drag multiple PDFs at once) — biggest follow-up for the upcoming Trainerize migration session.