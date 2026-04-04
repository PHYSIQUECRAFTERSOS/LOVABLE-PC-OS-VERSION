
## AI-Powered Client Import System

### Overview
Build a multi-step AI import flow that reads PDF files (workout programs, meal plans, supplement stacks) using the Anthropic Claude API and maps their content into existing database structures. Two entry points: Master Libraries (shared templates) and Client Profile (direct assignment).

### Step 1: Add ANTHROPIC_API_KEY Secret
Request the Anthropic API key from you and store it as a backend secret for use in the edge function.

### Step 2: Create `ai_import_jobs` Database Table
New table to track import job state (queued → processing → review → importing → done → failed). Stores extracted JSON, match results, and error messages. RLS policies restrict coaches to their own jobs, admins can see all.

**Columns:** id, created_by, client_id (nullable), status, document_type, file_names, extracted_json, match_results, final_data, error_message, created_at, updated_at.

### Step 3: Build `ai-import-processor` Edge Function
`supabase/functions/ai-import-processor/index.ts`

- Receives job_id, base64 PDF files, file names, and import type
- Calls Anthropic API directly via `fetch()` (no SDK) using `claude-sonnet-4-20250514` with PDF document blocks
- System prompt enforces strict extraction — zero inference, only data present in the document
- Returns structured JSON with workout days, meal plans, and supplement stacks
- Runs fuzzy matching against existing `exercises` and `food_items` tables using similarity scores
- Stores results in `ai_import_jobs` and updates status at each step
- Confidence badges: green (≥0.85), yellow (0.60–0.84), red (<0.60)

### Step 4: Build Frontend Components

**`src/components/import/AIImportButton.tsx`**
Gold button with props: `entryPoint ('library' | 'client')`, `clientId?`, `importType ('workout' | 'meal' | 'supplement' | 'any')`. Opens the import modal.

**`src/components/import/AIImportModal.tsx`**
Multi-step modal (no form tags, all onClick/onChange):
1. **Upload** — drag-and-drop PDF zone, file type auto-detect dropdown
2. **Processing** — progress indicator with pulsing status (8s+ threshold), polls job status
3. **Review** — structured preview of all extracted data with match confidence badges
4. **Saving** — per-item progress with checkmarks
5. **Done** — green confirmation banner

**`src/components/import/ExerciseMatchReview.tsx`**
Shows each exercise: PDF name → matched catalog exercise + confidence badge. Yellow/red items get inline search dropdown to manually select correct exercise or confirm "Create New".

**`src/components/import/FoodMatchReview.tsx`**
Shows foods grouped by meal card. Each food: PDF name + quantity → matched food or orange "Custom Food" badge with pre-filled nutrition values.

**`src/components/import/SupplementReview.tsx`**
Simple table: name, dose, timing, reason. No matching needed — creates new entries if not found.

### Step 5: Integration Points (minimal injection into existing files)

- **`MasterLibraries.tsx`**: Add AIImportButton in Programs tab, Meals tab, and Supplements tab top-right button groups
- **`ClientDetail.tsx`**: Add AIImportButton in the profile action bar with `importType='any'` and `clientId`

### Step 6: Save Logic
On coach confirmation, write records to existing tables:
- **Workouts**: Create program → phases → program_workouts → workout_exercises using matched exercise IDs
- **Meal Plans**: Create meal_plans → meal_plan_days → meal_plan_items linking to matched or newly-created food_items
- **Supplements**: Create/reuse master_supplements → supplement_plan → supplement_plan_items

### Key Rules Enforced
- Never create duplicate exercises — match against catalog first, coach confirms
- Each meal is a closed list — only foods literally in the PDF for that meal
- Calorie/macro values used exactly as written in PDF, no recalculation
- Custom foods created with full nutrition data before being referenced
- Unmatched items flagged for coach resolution before saving
- All new tables have RLS policies
- No existing components rebuilt — only button injection

### Files Created
- `supabase/functions/ai-import-processor/index.ts`
- `src/components/import/AIImportButton.tsx`
- `src/components/import/AIImportModal.tsx`
- `src/components/import/ExerciseMatchReview.tsx`
- `src/components/import/FoodMatchReview.tsx`
- `src/components/import/SupplementReview.tsx`

### Files Modified (button injection only)
- `src/pages/MasterLibraries.tsx`
- `src/pages/ClientDetail.tsx`
- `supabase/config.toml` (add function config)
