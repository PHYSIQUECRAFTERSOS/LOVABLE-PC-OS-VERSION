## Diagnosis

Your client is right — history is lookup-by-`exercise_id`, and that ID silently changes between phases.

**Where the lookup happens** (`src/components/WorkoutLogger.tsx`, lines 502–546):
```
select ... from exercise_logs
where exercise_id in (<current workout's exercise ids>)
  and workout_sessions.client_id = user.id
  and workout_sessions.status = 'completed'
```
Then it groups by exercise, picks the newest session per exercise, and passes that as `previousSets` → `ExerciseCard`.

**Why it misses history:** the `exercises` table has duplicates for the same lift. A live count shows this today:
- `incline cable chest press` → 3 rows
- `tibialis raises` → 3 rows
- `jumping lunges`, `hack squat`, `push ups`, `t bar row`, `russian twist`, `cable rear delt flyes`, `mountain climbers`, `seated dumbbell shrug`, `standing loop band curl`, ~20+ others → 2 rows each

When the coach (or AI import) built the new phase, it picked a **different UUID** for the same-name exercise than the previous phase used. `exercise_logs` from the last block are keyed to the old UUID, so the `in (...)` filter never returns them. The card shows blank "previous" fields even though logs exist.

There is already an `exercise_synonyms` table (`term` / `canonical`) and an `exercise_extraction_aliases` table (`normalized_name` → `exercise_id`) — the import pipeline uses these but the workout history query does not.

## Fix Plan

### Step 1 (primary fix — code-only, safe)
Expand the history lookup in `WorkoutLogger.tsx` so it matches by **exercise identity**, not just UUID:

1. Build an "identity group" per current exercise: the set of all `exercises.id` whose `LOWER(TRIM(name))` matches the current exercise's normalized name, plus any IDs linked to it via `exercise_synonyms` / `exercise_extraction_aliases`.
2. Fetch a single grouped set of IDs, then query `exercise_logs` with `.in("exercise_id", allRelatedIds)`.
3. When grouping results, map each log back to the **current** exercise it should attach to (via `identity → current UUID` map), so `previousPerformance[currentExerciseId]` is populated even when the log used a sibling UUID.
4. Apply the same identity expansion to `personal_records` and `allTimeBests` so PR alerts and all-time bests carry across phases.

Result: history immediately starts flowing across programs/phases without touching data.

### Step 2 (UX improvement, code-only)
Right now `previousSets` is "latest completed session for this exercise". Add:

- **"Last time" ribbon** on each set row: `120 lb × 8 · Jun 12` (session date), pulled from the most recent per-set entry. This is what Strong / Hevy do and it directly answers "what did I do last week?".
- **Fallback ladder** when no exact set-number match exists: use `set_number - 1`, else the highest set from the previous session, so the placeholder is never empty when history exists.
- **All-time best chip**: show top-lbs × reps small chip under the exercise name (already computed as `allTimeBests`, just not surfaced per-set).

### Step 3 (data hygiene — requires migration approval)
Merge the ~20+ duplicate library rows into a single canonical row per exercise:

1. Read-only report first: list every duplicate group with (id, name, created_by, log count).
2. For each group pick the row with the most logs as canonical, then in one transaction:
   - `UPDATE workout_exercises SET exercise_id = <canonical> WHERE exercise_id IN <dupes>`
   - `UPDATE exercise_logs SET exercise_id = <canonical> WHERE exercise_id IN <dupes>`
   - `UPDATE personal_records SET exercise_id = <canonical> WHERE exercise_id IN <dupes>`
   - `UPDATE client_exercise_notes`, `exercise_media`, `exercise_synonyms.exercise_id`, `exercise_extraction_aliases.exercise_id`
   - `DELETE FROM exercises WHERE id IN <non-canonical dupes>`
3. Add a partial unique index on `LOWER(TRIM(name))` for `is_master=true` library exercises to prevent future duplicates being created accidentally.

I'll present the full dedupe list before executing so you can veto any merges you don't want (some "duplicates" might be intentionally distinct — e.g. different grips).

### Step 4 (prevention — code-only)
Two entry points create duplicate library rows today:

- **`AddExerciseModal`** (manual add from the workout builder) — before insert, fuzzy-match against existing library (there's already a `src/utils/exerciseMatcher.ts`). If a >0.85 match exists, reuse it and log to `exercise_extraction_aliases`.
- **AI import** (`supabase/functions/ai-import-processor` + `AIImportModal`) — same guard: before creating a new `exercises` row, run the extracted name through `exercise_extraction_aliases` and fuzzy match, only create when nothing matches.

## Scope for this turn

Steps 1 + 2 fix the immediate client complaint with **zero data changes** — they should be built and shipped first. Steps 3 + 4 are follow-ups that need migration approval and coach-tool testing; I'll present Step 3's dedupe report next once you approve Steps 1 + 2.

## Files touched (Steps 1 + 2 only)
- `src/components/WorkoutLogger.tsx` — identity-group history fetch, extended `allTimeBests`/PR lookup, pass session date + all-time best down.
- `src/components/workout/ExerciseCard.tsx` — render "last time" ribbon with date and all-time best chip, improved fallback for missing set number.
- No schema changes, no data changes, no auth changes.