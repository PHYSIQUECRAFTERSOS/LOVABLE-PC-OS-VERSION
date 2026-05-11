## Changes to AI Program Generator

All edits are in `supabase/functions/ai-generate-program/index.ts` (no UI/DB changes).

### 1. Strip the phase description (no more "8-week program designed for...")

- After validation, force `progResult.rationale = ""` before returning.
- This blanks the gray text under the phase title AND the saved phase description (the save flow uses `program.rationale.slice(0, 500)` for `program_phases.description`, so clients will see nothing there).
- Also remove the rationale instruction from the system prompt so the AI doesn't waste tokens generating it.

### 2. Strip per-exercise coaching notes

- In the post-processing loop (where rest times are normalized), set `ex.notes = ""` for every non-mobility exercise.
- Mobility exercises keep their note (`"1 set, 10 reps per exercise"`).
- Update the system prompt: replace rule #16 ("Every exercise must have a 1-2 sentence J3U-style execution cue…") with "Leave the notes field as an empty string for every exercise."
- Remove the `validateProgram` check that errors out when `notes` is missing/short (lines 147–150) so blank notes pass validation.

### 3. Forbid "Arnold Press" unless the client has a home gym

- Compute `homeGym = /home/i.test(trainingLocation)` from the existing `trainingLocation` value.
- Add to the system prompt: "Do NOT use the exercise 'Arnold Press' (or any Arnold-press variant) UNLESS the client trains at a home gym."
- Add a server-side guard in `validateProgram`: if `!homeGym` and the resolved exercise name matches `/arnold\s*press/i`, push a validation error so the generator retries without it. Pass `homeGym` through the validator context.

### 4. Mobility rest = 0s (already enforced)

- The post-process already prepends each mobility drill with `rest_seconds: 0`. No change needed, but I'll add a defensive line: after the unshift, explicitly set `day.exercises[0].rest_seconds = 0` so future edits to the loop can't accidentally bump it to 120.

### Scope

- Only new generations (per prior decision).
- No frontend changes.
- No DB migrations.
- Edge function will be redeployed.
