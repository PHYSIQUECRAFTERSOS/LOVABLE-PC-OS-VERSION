

## AI-Powered Client Import System — Implementation Plan

### Overview
Build a multi-step AI import flow that reads PDF documents (workout programs, meal plans, supplement stacks) using Anthropic Claude, extracts structured data, fuzzy-matches against existing exercises/foods, and lets the coach review before saving to the database.

### Step 1: Create `ai_import_jobs` Table
New database table to track import state machine.

**Columns:** id (uuid PK), created_by (uuid, references auth.users), client_id (uuid, nullable), status (text: queued/processing/review/importing/done/failed), document_type (text: workout/meal/supplement), file_names (text[]), extracted_json (jsonb), match_results (jsonb), final_data (jsonb), error_message (text), created_at, updated_at.

**RLS:** Coaches see their own jobs. Admins see all.

### Step 2: Create `ai-import-processor` Edge Function
`supabase/functions/ai-import-processor/index.ts`

- Receives job_id, base64 file content, file names, document type
- Authenticates the caller (coach/admin only)
- Calls Anthropic API with `claude-sonnet-4-20250514` using PDF/image document blocks
- System prompt enforces strict extraction — only data literally present in the document
- Runs fuzzy matching against `exercises` table (using pg_trgm `similarity()` via Supabase RPC) and `food_items` table
- Confidence scoring: green (≥0.85), yellow (0.60–0.84), red (<0.60)
- Updates `ai_import_jobs` row at each stage (processing → review or failed)

### Step 3: Build Frontend Components

**`src/components/import/AIImportButton.tsx`**
Gold-accent button with sparkle icon. Props: `entryPoint`, `clientId?`, `importType`. Opens the modal.

**`src/components/import/AIImportModal.tsx`**
Multi-step dialog:
1. **Upload** — drag-and-drop zone for PDFs/images, document type selector
2. **Processing** — pulsing progress with status polling (polls `ai_import_jobs` every 3s)
3. **Review** — renders the appropriate review component based on document_type
4. **Saving** — per-item progress indicators
5. **Done** — success confirmation

**`src/components/import/ExerciseMatchReview.tsx`**
Each extracted exercise shows: PDF name → matched catalog exercise + confidence badge. Yellow/red items get inline search to manually pick correct exercise or "Create New".

**`src/components/import/FoodMatchReview.tsx`**
Foods grouped by meal. Each food: PDF name + quantity → matched food_item or "Custom Food" badge with pre-filled nutrition.

**`src/components/import/SupplementReview.tsx`**
Simple table: name, dose, timing, reason. Creates new entries if not in catalog.

### Step 4: Integration Points

- **`MasterLibraries.tsx`**: Add AIImportButton in Programs tab header area
- **`ClientDetail.tsx`**: Add AIImportButton in the client profile action bar with `importType='any'` and `clientId`

### Step 5: Save Logic
On coach confirmation, write to existing tables:
- **Workouts**: program → phases → program_workouts → workout_exercises (using matched exercise IDs)
- **Meal Plans**: meal_plans → meal_plan_days → meal_plan_items (linking to matched/new food_items)
- **Supplements**: master_supplements → supplement_plan → supplement_plan_items

### Files Created
- `supabase/functions/ai-import-processor/index.ts`
- `src/components/import/AIImportButton.tsx`
- `src/components/import/AIImportModal.tsx`
- `src/components/import/ExerciseMatchReview.tsx`
- `src/components/import/FoodMatchReview.tsx`
- `src/components/import/SupplementReview.tsx`

### Files Modified
- `src/pages/MasterLibraries.tsx` (button injection)
- `src/pages/ClientDetail.tsx` (button injection)
- `supabase/config.toml` (edge function config)

### Key Rules
- Never create duplicate exercises — match against catalog first, coach confirms
- Calorie/macro values used exactly as written in PDF, no recalculation
- Unmatched items flagged for coach resolution before saving
- All database changes use migrations with IF NOT EXISTS guards
- Edge function uses ANTHROPIC_API_KEY (already configured)

