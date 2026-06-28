# Fix Trainerize Workout Import — Name Swap Bug

## Problem
For Lee's 4-day PDF, the imported workouts have the correct **day names, sets, reps, rest** — but the **exercise names are wrong** (e.g. PDF says "Lying Dumbbell Curl" → app saved "Barbell Straight Bar Curl"; "Upper Body Mobility Routine" → "Mobility lower body"; "dumbbell hammer curl" → "dumbbell incline curl"). Other Trainerize PDFs imported fine, so the regression is specific to this PDF's text layout.

## Root cause
`src/lib/ai-import/trainerizeWorkoutParser.ts` decides a line is an exercise via `isExerciseBullet`, which requires `^\s*▶`. In Lee's PDF the text extractor places every `▶` glyph on its own line at the bottom of the block instead of prefixing the exercise rows:

```
Flat dumbbell bench press3 sets x 8-10 reps Rest 2 min between sets
Machine seated chest press …3 sets x 10-12 reps Rest 2 min between sets
…
▶
▶
▶
```

Because no line starts with `▶`, the deterministic parser extracts **0 exercises per day**. Then in `ai-import-processor/index.ts → normalizeAgainstTrainerizeSummary`, the rule `useSummaryExercises = aiExercises.length < floor(summaryExercises.length * 0.65)` resolves to `false` (summary is empty), so the AI's free-form guess is accepted. The AI preserves rep ranges (it can read "3 sets x 8-10 reps") but hallucinates exercise names — exactly what the screenshots show.

The day-name parsing also has a smaller issue: when the heading line concatenates with the tempo boilerplate ("Day 1: Chest & Back & arms ATempo [2:0:1:0]…"), `canonicalHeading` returns the dirty form, and a clean copy appears later, so the same day can be counted twice with two different names.

## Fix (frontend parser only, then re-trigger import)

### 1. `src/lib/ai-import/trainerizeWorkoutParser.ts`
Make exercise detection independent of the `▶` glyph:

- Replace `isExerciseBullet(line)` with a signature-based check: a line is an exercise row when, after `stripDecorations`, it matches one of:
  - `\b\d+\s+sets?\s*x\s*\d+` (e.g. "3 sets x 8-10")
  - `\b\d+\s*set\s*x\s*\d+`
  - `\b\d+\s*reps?\b` combined with a leading non-numeric name
  - `\b\d+\s*seconds?(?:\s*\/\s*exercise)?\b` (mobility/stretch rows like "1 set x 15 seconds/exercise")
  - `\bAMRAP\b`
  AND does not match the exclusion set already handled by `isExerciseInstruction` (numbered cues, "EACH SIDE AS WELL", "Tempo", "Warmup", "Rest for N", "Repeat new set", "Superset of N sets", "Dismiss", page headers/URLs, `Previous Stats`, `Tracking Sheet`, the global boilerplate paragraphs that start with "The First number"/"The second number"/"The third"/"The final"/"Example:"/"ALL SET SHOULD BE"/"IF YOU HIT"/"Then bump up").
- Keep the existing superset state machine (`Superset of N sets` → `Rest for N sec` → `Repeat new set`) unchanged; it doesn't depend on `▶`.
- Strengthen `extractName` so it also trims an optional leading bullet (`▶`) when present, and tolerates the "Name<NoSpace>3 sets x …" concatenation (split at the first run of digits that begins a sets/reps token).
- Tighten `canonicalHeading`:
  - Strip a trailing "Tempo [..." / "FOR ALL EXERCISES…" / "Which is […]" / "ALL SET SHOULD BE…" suffix when concatenated to the heading.
  - After cleaning, run the result back through `HEADING_RE` to confirm.
  - When the same heading appears in both dirty and clean forms, the cleaned form deduplicates them.
- Keep the existing Tracking Sheet name upgrade — it still helps when bullet names are truncated with `…`.

### 2. `supabase/functions/ai-import-processor/index.ts`
Make the normalizer authoritative when the parser produced a real exercise list:

- In `normalizeAgainstTrainerizeSummary`, change the merge rule to: if `summaryExercises.length > 0`, ALWAYS use `summaryExercises` (names, sets, reps, rest, grouping) and only borrow `tempo / rir / rpe / notes` from the matching AI exercise (by position). Keep AI fallback only when the parser found no exercises for that day.
- No prompt changes needed; the existing "summary block is source of truth" instruction already covers this.

### 3. Test fixture
Add `lee 4 day week.pdf` extracted text as a vitest fixture in `src/lib/ai-import/trainerizeWorkoutParser.test.ts` and assert:
- 4 unique workouts: "Day 1: Chest & Back & arms A", "Day 2: Shoulders & Legs A & Calves & core A", "Day 3: Chest & Back & arms B", "Day 4: Shoulders & Legs A & Calves & core B".
- Day 1 contains exactly: Upper Body Mobility Routine, Flat dumbbell bench press (3×8-10, 120s), Machine seated chest press me (3×10-12, 120s), Standing Cable Chest Fly Mid (2×12-15, 120s), lying dumbbell row (3×8-10, 120s), Machine Neutral Row (3×10-12, 120s), superset {Lying Dumbbell Curl 8-10, Lying Dumbbell Tricep Extensions 12-15} rest 60.
- Day 3 superset is {dumbbell hammer curl 8-10, Smith Machine close grip bench press me 10-12}, not "dumbbell incline curl" / "barbell close grip bench".
- Re-run the existing test fixture (the previous 9-workout PDF) to confirm no regression.

### 4. Verification
After build mode:
- Run `bunx vitest run src/lib/ai-import/trainerizeWorkoutParser.test.ts`.
- Re-import Lee's PDF via the AI Import flow and visually confirm Day 1/2/3/4 exercise names match the PDF.

## Out of scope
No schema changes, no edge-function prompt rewrite, no UI changes. Server normalizer change is a single function tweak; everything else is in the deterministic parser.
