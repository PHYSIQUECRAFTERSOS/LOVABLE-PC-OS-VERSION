# Master Libraries N+1 Fix — Phase 2, Step 2

Scope: **only** `src/components/training/ProgramDetailView.tsx`, function `loadProgram()` (lines ~222–307).

## Change

Replace the sequential `for (const phase of phaseRows) { await supabase.from("program_workouts")... }` loop with a single batched query, mirroring the pattern already used in `useClientProgram.ts` and `ProgramOverviewPane.tsx`.

### New flow inside `loadProgram()`

1. Load `programs` row (unchanged).
2. Load `program_phases` rows (unchanged).
3. Collect `phaseIds = (phaseRows || []).map(p => p.id)`.
4. **One** batched query:
   ```ts
   const { data: allPws } = await supabase
     .from("program_workouts")
     .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(name)")
     .in("phase_id", phaseIds)
     .order("sort_order");
   ```
   (Adds `phase_id` to the selected columns so we can group in memory. All other columns and ordering are identical to today.)
5. Group `allPws` by `phase_id` into `pwByPhase: Record<string, ProgramWorkout[]>` using the exact same row-to-`ProgramWorkout` mapping as today.
6. Iterate `phaseRows` and build `loadedPhases` using `pwByPhase[phase.id] || []`.
7. **Legacy fallback**: only for phases where `pwByPhase[phase.id]` is empty/undefined, run the existing `program_weeks` + `program_workouts(week_id in …)` fallback for that specific phase. All non-empty phases skip the fallback entirely. The fallback code path itself is unchanged in behavior.
8. Rest of `loadProgram` (empty-program seed, `setPhases`, meta load, `setLoading(false)`) unchanged.

No parallelism is being introduced (single batched query + rare per-empty-phase fallback), so no `Promise.all` / `Promise.allSettled` needed. If any parallelism is added for fallback phases, it will use `Promise.allSettled`.

## Explicitly not touched

- `getDisplayPosition()` and all display numbering.
- `loadWorkoutMeta()` / `get_workout_meta_batch` RPC.
- Any owner predicate, RLS policy, index, schema, migration.
- `ProgramOverviewPane`, `useClientProgram`, Command Center.
- Save/duplicate/delete paths lower in the file.
- Dates (still en-CA where relevant), and no "Track Water".

## Acceptance

- `loadProgram()` fires **one** `program_workouts` query with `.in("phase_id", phaseIds)` instead of one per phase.
- 7-phase program renders identical phases, workouts, order, and numbering.
- Network requests on program load drop from ~1-per-phase (+meta RPC) to 1 batched + unchanged meta RPC.
- Legacy fallback still runs only for genuinely empty phases.

## Reporting after implementation

- Exact line range changed in `ProgramDetailView.tsx`.
- Before/after request count for the 7-phase program load.
- Confirmation that rendered output is identical.
