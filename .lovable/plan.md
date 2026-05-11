# Mandatory abs scheduling in AI workout builder

## Goal
Every AI-generated program (3, 4, or 5 days/week) must include abs on exactly **2 training days**, with **2 distinct ab exercises × 3 sets × 60s rest** each. Days that contain abs get `" & Abs"` appended to their label. Ab days must be separated by **at least 2 rest/non-ab days** between them.

## Approach
All changes happen in the post-process step of `supabase/functions/ai-generate-program/index.ts` (after AI returns days, before response). The AI prompt is also updated to stop emitting its own abs so we can deterministically inject them. Strip-and-replace pattern.

## Steps

### 1. Update prompt rules
In `buildSystemPrompt()`:
- Change rule 13: remove "abs 10-20" from weekly volume guidance.
- Replace rule 20's abs special-case with: **"Do NOT include any abdominal/core exercises. The system injects a standardized abs block post-process."**
- Remove rule 21's ab-rest exception (no longer needed since AI won't emit abs).

### 2. Post-process injection (after existing rest-normalization loop, ~line 658)
Add a new block that runs after mobility prepend:

a. **Strip any abs the AI emitted** using existing `isAb()` helper.

b. **Pick 2 ab days** from `resolvedDays` with the spacing rule:
   - Sort days by `day_of_week`.
   - Find the pair `(i, j)` of training days where the gap between their `day_of_week` values (circular, week-wrap aware) is maximized, with a minimum of **2 full days between sessions** (i.e., at least 3 in `day_of_week` delta — e.g. Mon + Thu = 3 ✅, Mon + Wed = 2 ❌).
   - 3-day program → first and last training day (always satisfies).
   - 4-day Upper A / Lower A / Upper B / Lower B (e.g. Mon/Tue/Thu/Fri) → Mon + Thu (gap 3) or Tue + Fri (gap 3). Tie-break: pick the pair whose two days are upper-focused if available, else first valid pair.
   - 5-day Push/Pull/Legs/Upper/Lower (Mon-Fri) → Mon + Thu or Mon + Fri (max gap, prefer Mon + Fri = 4).
   - Fallback if no pair satisfies 2-day separation: pick the pair with the largest gap regardless.

c. **Pick 4 distinct ab exercises** from the library:
   - Filter library where `isAb({ name, primary_muscle })` is true AND not in `forbiddenExercises` list.
   - Shuffle deterministically (seeded by client id) and take 4. If <4 available, take what exists and repeat distinct ones; if 0, log warning and skip injection.
   - Assign 2 to each ab day (no overlap between the two days).

d. **Append ab exercises** to the end of each chosen day's `exercises[]` with:
   ```ts
   { name, sets: 3, reps: "12-15", rest_seconds: 60, notes: "", is_amrap: false, primary_muscle: "abs", exercise_id }
   ```
   Reps default `"12-15"` (matches existing isolation rep convention from rule 14).

e. **Rename the day**: `day.day_label = \`${day.day_label} & Abs\`` (idempotent — skip if already ends with "& Abs").

### 3. Verification
- Deploy edge function.
- Run AI builder on a 3-day, 4-day, and 5-day client. Confirm:
  - Exactly 2 days contain abs.
  - Each ab day has 2 distinct ab exercises, 3 sets, 60s rest.
  - Across the 2 days, all 4 ab exercises are distinct.
  - Day labels end with " & Abs".
  - No back-to-back ab days (≥2-day gap).

## Files touched
- `supabase/functions/ai-generate-program/index.ts` (prompt rules + new post-process block)

## Out of scope
- No DB schema changes.
- No client-side UI changes — saved program will already carry the renamed labels and injected exercises through the existing save path.
- Manual coach edits afterward are unaffected (Coach Authority rule).
