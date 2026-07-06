# Phase 1 Diagnostic — Workout Load Path (Read-Only)

No application code, schema, index, or RLS policy was modified. No temporary console.time markers were left in the tree (none were added — measurement was done from existing `useDataFetch` perf logs and DB introspection instead of instrumenting the client; see §3 caveat).

---

## 1. Workout load path — active files

Coach client-detail Training tab → `src/components/clients/workspace/TrainingTab.tsx` mounts `ClientProgramTwoPane` (`src/components/clients/workspace/training/ClientProgramTwoPane.tsx`). Program-level data comes from `useClientProgram` (`src/hooks/useClientProgram.ts`).

"Edit Workout" modal is `src/components/training/ClientWorkoutEditorModal.tsx` (desktop) or `src/components/training/MobileWorkoutEditor.tsx` (mobile). Both call `fetchWorkoutExerciseDetails(workoutId)` from `src/lib/workoutExerciseQueries.ts`.

`fetchWorkoutExerciseDetails` calls RPC `get_workout_exercise_details(_workout_id)` (single call) and falls back to two direct queries only if the RPC doesn't exist. Confirmed active — the RPC exists (`SELECT proname FROM pg_proc` returned it).

Preview modal (`WorkoutPreviewModal.tsx`) and dashboard `WorkoutStartPopup.tsx` share the same loader.

## 2. Fetch orchestration audit

Workout load itself (`fetchWorkoutExerciseDetails`) is **one RPC call, no loop, no N+1**.

`useClientProgram` (source of the "empty skeleton bars"): steps 1→2 sequential (`assignments`, then `programs`), step 3 fetches `program_phases` + `program_weeks` in **Promise.allSettled** ✅, step 4 fetches `program_workouts` for all phase ids in one `.in()` call, step 5 similar for weeks. No N+1.

`Promise.all` (invariant violation — not on the workout-detail load, but adjacent):

- `src/hooks/useWorkoutLauncher.tsx:34` — `[exerciseDetails, workoutRes]`
- `src/components/dashboard/WorkoutStartPopup.tsx:70` — same shape
- `src/components/training/WorkoutPreviewModal.tsx:97` — `[exerciseDetails, wRes]`
- `src/components/dashboard/TodayWorkout.tsx:33 & :68`
- `src/components/clients/workspace/training/ClientProgramTwoPane.tsx:237` — bulk `sort_order` update on drag
- 40+ other files (see full grep in exploration log)

The full grep produced ~70 hits. Flagged, not fixed, per Phase 1 rules.

## 3. Measurements (best available)

I did **not** inject temporary `console.time` calls (violates read-only spirit and would require a code edit). Numbers below come from the existing `useDataFetch` `[Perf]` log already in the console snapshot the user attached:

- `coach-command-center-…`: **2165ms** and **2288ms** (two consecutive loads) — flagged yellow (>2s).
- `[ProtectedRoute] Auth hydration stalled beyond 12s` — separate auth issue, not the workout path, but confirms Supabase is under enough pressure for the JWT to be slow.

DB-side, `pg_stat_statements` top offenders (see §7) do NOT list workout queries. Two reads:

1. Either workout queries are individually fast per call but slow via RLS on the "hot" rows the user hits, and are amortized across many statements the planner normalizes differently, or
2. `pg_stat_statements` was reset recently and hasn't accumulated the coach's session yet.

Precise per-request timings for a single workout open require either (a) proper instrumentation added in Phase 2 or (b) live browser measurement. Explicitly stating this rather than fabricating numbers.

## 4. Query shape audit (one workout open in the editor)

Requests fired by `ClientWorkoutEditorModal` open:

1. `SELECT id from calendar_events WHERE linked_workout_id=… AND event_type='workout' AND event_date>=today` (count-only, `head:true`) — cheap.
2. `SELECT name, instructions FROM workouts WHERE id=… .single()` — narrow columns ✅.
3. RPC `get_workout_exercise_details(_workout_id)` — one call, returns joined rows.
4. `SELECT id, name, primary_muscle, equipment, youtube_thumbnail, tags FROM exercises ORDER BY name` — **full-table library load, no LIMIT, no pagination**. This is a hidden cost every time the modal opens.

No `SELECT *` in the critical path. The `exercises` library dump is the largest payload here (grows with your exercise catalog).

## 5. Index audit (report only)

FK/filter columns already indexed on the workout path:

- `workout_exercises.workout_id`, `workout_exercises.exercise_id` ✅
- `program_workouts.phase_id`, `.week_id`, `.workout_id`, plus `(phase_id, sort_order)` and `(week_id, sort_order)` partial indexes ✅
- `program_phases.program_id` ✅ (duplicated — `idx_program_phases_program` and `idx_program_phases_program_id` are the same shape)
- `program_weeks.phase_id` ✅ but **no index on `program_weeks.program_id**` — `useClientProgram` filters weeks by `program_id`. Small table, may not matter yet.
- `programs.coach_id`, `programs.client_id` ✅
- `client_program_assignments.client_id`, `.status` ✅
- `coach_clients` has coverage ✅
- `exercises.id` pkey + trigram on `name` ✅

Proposed index candidates (Phase 2, awaiting approval):

- `CREATE INDEX ... ON program_weeks(program_id)`.
- Drop the duplicate `idx_program_phases_program` (keep `_program_id`).
- `CREATE INDEX ON calendar_events(linked_workout_id, event_type, event_date)` if the `scheduledCount` query becomes hot (currently `head:true`, likely cheap).

Nothing created.

## 6. RLS policy audit (report only)

Every workout-path policy calls `auth.uid()` **unwrapped** — initplan optimization is NOT active. Under Supabase's PG version this re-evaluates per row.

The specific offenders on the workout load path:

`**workouts` — policy `workouts_select_all_paths` (SELECT)**

```
(coach_id = auth.uid()) OR (client_id = auth.uid()) OR has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM program_workouts pw
      LEFT JOIN program_phases pp ON pp.id = pw.phase_id
      LEFT JOIN program_weeks  pwk ON pwk.id = pw.week_id
      JOIN client_program_assignments cpa
        ON cpa.program_id = COALESCE(pp.program_id, pwk.program_id)
    WHERE pw.workout_id = workouts.id
      AND cpa.client_id = auth.uid()
      AND cpa.status IN ('active','subscribed')
  )
```

Per-row EXISTS with a 3-way LEFT JOIN + COALESCE join to `programs`/`client_program_assignments`. Cost scales with `program_workouts` × `client_program_assignments`. After migrating 100+ clients this is your primary hot path.

`**workout_exercises` — policy `workout_exercises_select_all_paths` (SELECT)** — same shape wrapped in an outer `EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_exercises.workout_id AND (...same disjunction...))`. Effectively runs the workouts-policy EXISTS **for every exercise row** returned.

`**workout_exercises` — `Coaches can manage workout exercises` (cmd=ALL)** — ALL applies to SELECT too, adding a second EXISTS per row. Redundant with `workout_exercises_select_all_paths`.

`**program_phases` / `program_weeks` / `program_workouts**` — each uses `EXISTS (SELECT 1 FROM programs p WHERE p.id = … AND (p.coach_id = auth.uid() OR …))` plus a parallel "master shared" policy with a similar EXISTS. Also unwrapped `auth.uid()`.

`**client_program_assignments**` — has both `Coaches and admins can view their assignments` (cheap OR-chain) AND `Coach and client can view assignments` (adds an EXISTS against `coach_clients`). Two policies, both evaluated (ORed) on every SELECT.

Nothing modified.

## 7. Slow-query evidence

`pg_stat_statements` top by total time (workout-related queries not in top 15). Highest-ranked reads are `nutrition_logs` per-client scans (1527ms total across 34 calls, mean 45ms) and `client_risk_scores` (mean 189ms) — a separate pressure source on the coach dashboard, not the workout tab. Full dump available on request.

The absence of workout queries from the top-15 combined with the user-visible symptoms strongly implies the cost is being paid **inside RLS EXISTS subplans** attributed to the outer statement, not surfaced as a distinct offender. This matches the section 6 finding.

## 8. "Failed to load workout" root cause — named

Trigger site is `src/components/training/ClientWorkoutEditorModal.tsx:184-188`:

```ts
} catch (err: any) {
  setLoadError(err?.message || "Failed to load workout");
  toast({ title: "Failed to load workout", ...});
}
```

The `try` block wraps two awaited calls: (1) `supabase.from("workouts").select("name, instructions").eq("id", workoutId).single()`, then (2) `fetchWorkoutExerciseDetails(workoutId)` (RPC).

The banner appears when **either** call throws. Given the current data volume and the RLS shape in §6, the realistic failure modes are:

1. **PostgREST statement timeout** on the RPC because the RLS EXISTS on `workouts` + `workout_exercises` blows past the per-request budget (Supabase default ≈ 8s). Manifests as a thrown error with message about statement timeout / canceling statement.
2. `**useDataFetch` AbortError** on adjacent fetches (5s default for coach-side reads via `TIMEOUTS.STANDARD_API`) — this is what surfaces the "Retry" state on the Training tab skeleton (`GridSkeleton` + `RetryBanner` in `Training.tsx:317-319` and the `ClientWorkoutEditorModal` retry branch).

Not a rejected `Promise.all` in the workout-detail path itself — that path uses a serial `try/await`. **The `Promise.all` risk is in `WorkoutPreviewModal.tsx:97` and `WorkoutStartPopup.tsx:70**`, where a single rejected sub-query (the workout metadata or the exercise details) would take down the entire load — worth flagging for Phase 2 even though it isn't the same code path as the "Retry" you see in the editor.

RLS denial ruled out: you're admin+coach on your session, and the denial would return an empty result, not throw. So the fail is a timeout, not a permission error.

## 9. Client-side / session audit

- `useClientProgram` re-runs on every `clientId` change; no caching wrapper. Navigating between clients refetches everything.
- `useDataFetch` DOES have an in-memory `staleTime` cache — used by `Training.tsx` (`workouts-<uid>-<role>`, 3-min stale) and dashboards — but is **not used** by `useClientProgram`, `ClientProgramTwoPane`, or the editor. The coach client-detail view gets zero cache hits.
- `ClientProgramTwoPane.tsx:133-153` fires two effects on every `phases` change: `fetchWorkoutMeta(ids)` (RPC batch → falls back to N calls to `fetchWorkoutExerciseDetails` per workout if the RPC errors) and a `workouts.select("id, is_accessory").in("id", ids)`. Both are batched, not N+1, but they run on every reload.
- No eager roster load in the client-detail view. Coach roster is loaded separately by `CoachCommandCenter` on the dashboard, which is the source of the `[Perf] 🟡 coach-command-center: 2165ms` warnings you're seeing.
- Realtime subscriptions: not audited in depth this pass, but no obvious per-tab explosion in the workout path files. Flagged for a deeper look if Phase 2 doesn't recover latency.

---

## Ranked conclusion

**Primary root cause (very high confidence):** RLS policies on `workouts` and `workout_exercises` (and, secondarily, `program_workouts`/`program_phases`/`program_weeks`) use unwrapped `auth.uid()` inside per-row `EXISTS` subqueries that join `program_workouts → program_phases/weeks → client_program_assignments`. This cost scales with `program_workouts × assignments`, which is exactly the axis that grew during the Trainerize migration. It explains the coach-side slowdown, the editor spinner, and the timeout that surfaces as "Failed to load workout" / "Retry".

**Contributing factor 1 (high confidence):** The exercise library dump inside the editor (`SELECT … FROM exercises ORDER BY name` with no LIMIT/pagination) runs on every open and grows with the catalog.

**Contributing factor 2 (medium confidence):** `Promise.all` in `WorkoutPreviewModal.tsx:97`, `WorkoutStartPopup.tsx:70`, `useWorkoutLauncher.tsx:34`, and `TodayWorkout.tsx:33/68`. If either sub-query times out on the RLS above, the whole load rejects with a single error and there's no partial fallback. Violates the `Promise.allSettled` invariant.

**Contributing factor 3 (medium confidence):** `useClientProgram` has no caching layer — every tab-switch to a coach's client refetches phases/weeks/program_workouts even though the underlying data rarely changes within a session.

**Contributing factor 4 (low, structural):** Redundant SELECT-eligible `ALL` policy on `workout_exercises` doubles the EXISTS work per row.

## Hypothesis verdicts


| #   | Hypothesis                                     | Verdict                                                                                                                                             |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unwrapped `auth.uid()` + per-row EXISTS in RLS | **CONFIRMED** — every workout-path policy                                                                                                           |
| 2   | N+1 in workout load                            | **RULED OUT** in the detail loader (RPC-based); N+1-shaped only in the RPC-missing fallback                                                         |
| 3   | Reintroduced `Promise.all`                     | **PARTIALLY CONFIRMED** — not in the detail loader, but present in the preview + dashboard start popups + launcher, which surface the same error UI |
| 4   | Missing FK indexes                             | **MOSTLY RULED OUT** — coverage is good; `program_weeks.program_id` missing, `program_phases.program_id` duplicated                                 |
| 5   | `SELECT *` / over-fetch                        | **RULED OUT** in workout queries; **CONFIRMED** for the exercise library dump inside the editor                                                     |
| 6   | Client waterfall / re-renders / no cache       | **CONFIRMED** for `useClientProgram` (no cache), plus dashboard eager loads                                                                         |
| 7   | Connection / realtime pressure                 | **NOT CONFIRMED** — no obvious offender in workout files this pass                                                                                  |


## Baseline measurements (for verifying Phase 2 improvement)

- Coach Command Center: **2165ms / 2288ms** (from live perf log at time of report)
- `ProtectedRoute` reported auth hydration stall: **>12s** (separate but corroborates DB pressure)
- Workout editor open: not instrumented this pass — capture via Playwright in Phase 2 pre-fix baseline before touching anything.

## Not touched (per rules)

No code, no schema, no indexes, no RLS. No `Track Water` occurrences encountered on this path. `getDisplayPosition()`, `calendar_events`, en-CA dates, master-template safety — none of these were near the affected surface.

## Phase 2 preview (awaiting your approval, not implemented)

1. Rewrap `auth.uid()` → `(select auth.uid())` in the seven policies listed in §6.
2. Consolidate the redundant `workout_exercises` ALL-cmd policy.
3. Restore `Promise.allSettled` in `WorkoutPreviewModal`, `WorkoutStartPopup`, `useWorkoutLauncher`, `TodayWorkout`.
4. Paginate / lazy-load the exercise library inside `ClientWorkoutEditorModal` (search-first, first 200 rows, trigram-backed).
5. Add `useDataFetch` caching (or React Query) around `useClientProgram` keyed by `clientId`.
6. Add `program_weeks.program_id` index; drop the duplicate `program_phases` index.
7. Instrument the workout open path with real timings so the fix is measured, not assumed.

Awaiting your go-ahead before any of the above. yes. go ahead and make the changes as needed