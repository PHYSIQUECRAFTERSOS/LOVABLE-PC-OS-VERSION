# Fix AI Import rest timer parsing for supersets and missing-rest exercises

## Root cause

Two layers fail together:

1. **Edge Function prompt** (`supabase/functions/ai-import-processor/index.ts` lines 386–417) doesn't teach the model the superset rest semantics or the "no rest = null" rule. The model improvises — it sees "Rest for 60 sec" near a superset block and attaches 60 to every member.
2. **Client persistence** (`src/components/import/AIImportModal.tsx` line 336) writes whatever the model returned, with zero redistribution. There is no post-processing pass that walks supersets and reassigns rest.

No `?? 60` fallback exists in code — the 60s comes from the model itself, then is written verbatim. Fix must address both layers.

Also: line 336 uses `ex.rest_seconds || null`, which incorrectly maps an explicit `0` to `null`. Will be replaced with `?? 0`.

---

## Phase 1 — Update extraction prompt and schema

**File:** `supabase/functions/ai-import-processor/index.ts` → `buildSystemPrompt()` (~line 391)

New JSON shape adds `superset_groups` per day:
```json
{
  "program_name": "string",
  "days": [{
    "day_name": "string",
    "exercises": [{
      "name": "string",
      "sets": "number | null",
      "reps": "string",
      "rest_seconds": "number | null",
      "tempo": "string | null",
      "rir": "number | null",
      "rpe": "number | null",
      "notes": "string | null",
      "grouping_type": "superset | circuit | null",
      "grouping_id": "string | null"
    }],
    "superset_groups": [{
      "grouping_id": "string",
      "rest_seconds_between_rounds": "number | null"
    }]
  }]
}
```

New explicit rules in the prompt:
- "If the PDF does not specify a rest value for an exercise, return `rest_seconds: null`. Do NOT invent 60 or any default."
- "When you see 'Superset of N sets' / 'Giant set' / 'Circuit', assign every exercise in that block the same `grouping_id` (short string like `g1`). Set `grouping_type` to `superset` or `circuit`."
- "The 'Rest for X sec' line that follows the superset block belongs to the **group**, not to any individual exercise. Put it in `superset_groups[].rest_seconds_between_rounds`. Inside the group, set every exercise's `rest_seconds` to null."
- "Convert all rest values to seconds: '2 min' = 120, '90 sec' = 90, '15 sec' = 15."

---

## Phase 2 — Post-extraction redistribution (the actual fix)

**File:** `src/components/import/AIImportModal.tsx` → `saveWorkoutProgram()` (lines 310–346)

Before the per-exercise insert loop, build group lookups:
```ts
const groupRestById = new Map<string, number>();
for (const g of (day.superset_groups ?? [])) {
  if (g.grouping_id) groupRestById.set(g.grouping_id, g.rest_seconds_between_rounds ?? 0);
}
const lastIndexByGroup = new Map<string, number>();
dayExercises.forEach((ex, idx) => {
  if (ex.grouping_id) lastIndexByGroup.set(ex.grouping_id, idx);
});
```

Replace line 336 (`rest_seconds: ex.rest_seconds || null`) with:
```ts
let finalRest: number;
if (ex.grouping_id && groupRestById.has(ex.grouping_id)) {
  const isLast = lastIndexByGroup.get(ex.grouping_id) === ei;
  finalRest = isLast ? groupRestById.get(ex.grouping_id)! : 0;
} else {
  finalRest = ex.rest_seconds ?? 0;   // trust the PDF; never invent 60
}
// then: rest_seconds: finalRest
```

Defensive fallback: if `superset_groups` is missing but exercises share a `grouping_id` (older model output), assign rest=0 to all members and log a warning.

Keep `grouping_type` / `grouping_id` write-through unchanged so the editor's superset banner still renders.

---

## Phase 3 — Audit pass

Re-grep the importer for `?? 60`, `|| 60`, `: 60`, `defaultRest`. Currently none exist; re-verify after Phase 2 changes. Only acceptable fallback for missing rest is `0`.

---

## Phase 4 — Debug logging behind `VITE_DEBUG_AI_IMPORT`

Client (only when `import.meta.env.VITE_DEBUG_AI_IMPORT === 'true'`):
1. After model returns: log `{ name, raw_rest, group, group_rest }` per exercise.
2. After redistribution: log `{ name, final_rest, is_last_in_group }`.

Edge Function (only when `Deno.env.get("DEBUG_AI_IMPORT") === 'true'`):
- Log full raw model JSON for the workout extraction (structured `console.log(JSON.stringify(...))` for grep-ability).

---

## Phase 5 — Manual verification matrix (Jose Lopez Phase 11)

| Exercise | Expected rest |
|---|---|
| Upper Body Mobility Routine | **0s** |
| Incline Smith bench press | 120s |
| Cable Fly Low To High (myo) | 15s |
| Day 1 superset: rope hammer curl | **0s** |
| Day 1 superset: tricep rope pushdown | **90s** |
| Day 3 superset: incline hammer curl | **0s** |
| Day 3 superset: lying DB tricep ext | **60s** |

Phase 1 (prompt) + Phase 2 (redistribution) are belt-and-suspenders: even if the model still attaches 60 to a superset member, the client redistribution overrides it.

---

## Files touched

- `supabase/functions/ai-import-processor/index.ts` — prompt + schema (no API call format change)
- `src/components/import/AIImportModal.tsx` — redistribution + `?? 0` fallback

No DB migrations. No RLS changes. No new columns. Existing `workout_exercises` columns (`rest_seconds`, `grouping_type`, `grouping_id`) cover the full requirement.

Both Master Library and Client Profile imports already share `AIImportModal` + the single Edge Function, so the fix lands on both surfaces simultaneously.

---

## Decisions made on consultant recommendations

- **Rec 6 (null vs 0):** Write **`0`**, not `null`, when PDF specifies no rest. Matches "trust the PDF" spec and gives the timer UI an explicit value.
- **Recs 1, 2, 3, 4, 5:** Out of scope here — separate prompts (pre-save rest review, tempo parsing, AMRAP markers, bulk import, fixture tests).