## Goal
Fix the AI workout import so a multi-week PDF (like Zach Ivie's 6-week program) produces correctly-scheduled workouts that mirror the master library — preserving every unique day name verbatim (`[AWAY]Day 1: Upper`, `Day 1: UPPER A`, etc.), pulling full exercise lists for each, attaching per-workout instructions, and reusing existing master library workouts when the name matches exactly.

## Problems Today
1. The PDF lists 8 unique workout templates but repeats each one across 30 scheduled program days. The extractor treats every repetition as a brand-new day with truncated exercises (screenshots: "Day 1: Upper — 1 exercise / Est. 1 min").
2. Tag prefixes like `[AWAY]` and `A`/`B` suffixes get stripped or merged, collapsing distinct workouts ("Day 1: Upper" hotel vs gym become the same).
3. Per-workout instruction blocks (the text under each day heading) are never saved.
4. The importer always creates new workouts even when an identical master library workout already exists.

## Plan

### 1. Edge function: extract unique templates + schedule (`supabase/functions/ai-import-processor/index.ts`)
Change the workout extraction prompt so the AI returns two arrays:
- `workouts[]` — one entry per **unique** day heading found in the PDF, with `day_name` copied **verbatim** (including `[AWAY]`, `A`/`B`, brackets, casing), plus `instructions` (the full text block under that heading, minus repeated boilerplate), plus the full `exercises[]` and `superset_groups[]`.
- `schedule[]` — ordered list of `{ position, day_name }` describing the program order across all weeks. The AI builds this by walking the PDF page-by-page and emitting one entry per scheduled day, referencing a `workouts[]` entry by exact `day_name`.

Prompt rules added:
- "Preserve `[AWAY]`, brackets, casing, and A/B suffixes exactly. Never normalize or merge."
- "If the same heading appears twice with the same exercise list, define it ONCE in `workouts[]` and reference it from `schedule[]` for every occurrence."
- "Capture the instructions paragraph(s) directly under each heading (before the first exercise). Strip the repeated tempo/warmup boilerplate that appears on every page."

Backward compatibility: if the model still returns the old `days[]` shape, fall back to the existing path.

### 2. Match against existing master library workouts
In `matchExercises` (or a new `matchWorkouts` step), for each `workouts[]` entry:
- Query `workouts` table where `coach_id = caller`, `is_template = true`, `is_master = true`, and `lower(name) = lower(day_name)`.
- If exactly one match, attach `existing_workout_id` to that template entry.
- Surface this in the review step so the coach sees "Reusing master: [AWAY]Day 1: Upper" vs "Creating new".

### 3. Client commit (`src/components/import/AIImportModal.tsx::saveWorkoutProgram`)
Rewrite the commit loop:
1. Build a `workoutIdByName` map. For each entry in `workouts[]`:
   - If `existing_workout_id` is set, store it in the map (do NOT re-insert).
   - Otherwise insert a new `workouts` row with `name = day_name` (verbatim) and `description = instructions`, then insert its exercises (existing logic).
2. Walk `schedule[]` and insert one `program_workouts` row per scheduled position, pointing at `workoutIdByName[entry.day_name]`, with `sort_order = position`. The same `workout_id` is referenced N times — edits to the workout flow to every scheduled occurrence (matches the existing `sync_phase_labels_on_reorder` trigger behavior).
3. If `schedule[]` is absent (legacy extractions), fall back to the current "one workout per day" path.

### 4. UI tweak (`src/components/import/ExerciseMatchReview.tsx`)
Add a small banner above the exercise list summarizing the parsed structure:
- "8 unique workouts detected, scheduled across 30 days."
- "Reusing 4 master library workouts."
- "Tag prefixes preserved: [AWAY]."

No schema changes. No changes to meal/supplement import. Existing programs untouched. The `workouts.description` column already exists and is used for per-workout instructions.

## Expected Result for Zach Ivie's PDF
- 8 unique workout rows created (or reused from master): `[AWAY]Day 1: Upper`, `[AWAY]Day 2: Legs A & Core A`, `[AWAY]Day 3: Upper`, `[AWAY]Day 4: Lower & Core`, `Day 1: UPPER A`, `Day 2: LOWER A & calves & abs`, `Day 3: UPPER B`, `Day 4 : LOWER B & calves & abs`.
- 30 `program_workouts` rows linking those 8 workouts to scheduled days in the order printed in the PDF.
- Per-workout instructions saved to `workouts.description`.
- If those 8 names already exist as masters, the new program references them directly instead of creating duplicates.

## Files Touched
- `supabase/functions/ai-import-processor/index.ts` (extraction prompt + workout master-lookup)
- `src/components/import/AIImportModal.tsx` (commit loop rewrite, schedule-aware)
- `src/components/import/ExerciseMatchReview.tsx` (small summary banner)
