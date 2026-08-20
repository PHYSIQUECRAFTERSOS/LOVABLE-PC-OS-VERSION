# Stabilize and speed up core app loading

## Goal
Make the client Training screen safe to publish first, then remove the shared failure patterns behind intermittent slow/empty dashboard, nutrition, and coach screens without hiding real errors.

## Confirmed findings
- Client Training currently converts a failed/aborted workout request into the same empty array used for a genuinely empty program. That can display “No workouts” after a transient request failure.
- The client program hook preserves good cached data during refresh failures, but on a cold failure it ends loading with no recoverable error UI; it also runs a nested retry/timeout chain around the backend request.
- Coach client loading uses one unguarded `Promise.all`; a transient profile request can reject the whole load, while a successful response with no profile is the only case that should display “Client not found.”
- Workout duplication performs several direct reads/writes without the shared transient retry policy, so a single desktop `Failed to fetch` aborts the operation.
- Meal copying has no hard timeout around micronutrient lookup or the final insert, allowing “Copying…” to remain pending when a request hangs.
- Live checks show the backend is healthy and routes generally return in roughly 2.8–5.3 seconds on cold navigation. The coach command center itself logged about 2.4 seconds, so this is primarily request orchestration and failure-state correctness rather than a compute-size problem.
- Auth session events resolve successfully in the supplied logs, but `ProtectedRoute` still reports a 12-second stall afterward; auth hydration will be instrumented and deduplicated rather than papered over with a longer timeout.

## Release-blocking pass: Client Training
1. Separate `loading`, `error`, and true-empty states so a timeout/network failure can never render “No workouts in this phase.”
2. Keep the last verified program/workout payload visible during revalidation and add a clear retry action for cold failures.
3. Remove overlapping timeout/retry ownership so one layer controls retries and cancellation; prevent an outer abort signal from silently becoming empty data.
4. Validate the actual assigned-program bundle and workout list for populated, empty, slow, and failed responses.

## Reliability pass: shared affected flows
1. Refactor coach client-header loading to settle independent requests, retry transient transport failures, preserve cached header data, and reserve “Client not found” for a confirmed successful profile lookup.
2. Wrap workout duplication’s independent reads/writes in bounded transient retries while preserving existing verification and partial-failure reporting; prevent duplicate inserts when retrying a completed write.
3. Bound meal-copy lookup and insert operations, always release the pending UI state in `finally`, and show a retryable error without clearing the current tracker.
4. Deduplicate auth resolution for repeated `INITIAL_SESSION`, `SIGNED_IN`, and `TOKEN_REFRESHED` events for the same session; add timing markers to identify which hydration step causes the observed stall.
5. Keep existing snapshots/caches, but never cache fallback empty arrays or overwrite verified data after a failed refresh.

## Performance pass
- Reduce repeated client-side request waves only where the traces prove duplication.
- Preserve current fast backend functions and role/RLS semantics.
- Add targeted timing around Training, client header, duplicate workout, and meal copy so regressions are observable without noisy production logs.
- Do not increase global timeouts or recommend a larger Lovable Cloud instance unless final measurements show a backend bottleneck.

## Validation
- Add focused tests for transient failure versus true-empty behavior, stale-data preservation, bounded meal-copy state, and retry classification.
- Verify populated and empty client programs with forced timeout/network-failure cases.
- Verify coach client navigation cannot falsely show “Client not found.”
- Duplicate a workout and confirm exactly one workout plus the expected exercises persist.
- Copy a planned meal and confirm the button always exits “Copying…” on success, timeout, and database error.
- Run authenticated desktop and 375px mobile flows twice: cold load and warm revisit for Dashboard, Training, Nutrition, Calendar, and coach client Training.
- Compare before/after timings and require no stuck spinners, false empty states, uncaught console errors, or duplicate writes before publishing.

## Technical details
- Expected frontend files include `src/pages/Training.tsx`, `src/hooks/useClientProgram.ts`, `src/pages/ClientDetail.tsx`, `src/components/clients/workspace/TrainingTab.tsx`, `src/lib/cloneWorkoutHelpers.ts`, `src/hooks/useMealPlanTracker.ts`, `src/components/nutrition/DailyNutritionLog.tsx`, `src/lib/resilientFetch.ts`, `src/hooks/useAuth.tsx`, and `src/components/ProtectedRoute.tsx`.
- Database changes are not planned. If implementation proves a backend function is incorrect, stop and verify its permissions/data behavior before proposing an additive migration.
- No new edge function or secret is expected.
