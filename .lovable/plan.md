# Fix client training-program workouts not loading

## Scope
Only change the client-facing **Training → Program** loading path. Do not alter dashboards, calendar, nutrition, messages, coach program editing, workout completion, caching strategy, service workers, or unrelated backend policies.

## Confirmed current state
- The affected “(coach Jayden) 5 day Kevin Wu split” assignment exists and is active.
- Its two phases and workout links are present in the database; the current phase contains six valid workouts. This is a loading-path failure, not missing program data.
- The client screen currently loads assignments, programs, phases, phase workouts, weeks, week workouts, workout names, and thumbnails through several dependent requests.
- The project already has a secured `get_client_program_bundle_fast` backend function that returns the active assignment, program, phases, weeks, and workout names in one call, and the coach workspace already consumes it through `useClientProgram`.

## Implementation
1. Refactor `ClientProgramView` to use the existing `useClientProgram` single source of truth for the signed-in client’s active program instead of its duplicated multi-request assignment/detail chain.
2. Preserve the current client behavior that selects only the date-derived current phase, with the stored phase and first phase as safe fallbacks.
3. Support both direct phase workouts and week-based workouts from the returned bundle, deduplicate by workout ID, and retain the authored workout ordering and labels.
4. Keep thumbnail enrichment non-blocking: workout names and Start buttons must render even if thumbnail/exercise-summary loading fails or times out.
5. Preserve the existing last-good local cache and Retry state so a transient mobile request cannot replace valid workouts with an empty/error result.
6. Surface the real load error in diagnostics while keeping the existing friendly client-facing message.

## Technical details
- Primary files: `src/components/training/ClientProgramView.tsx` and, only if needed for a reusable mapping correction, `src/hooks/useClientProgram.ts`.
- No schema changes are expected. Do not modify RLS policies or the secured bundle function unless authenticated verification proves the existing function itself is failing.
- Remove the unsafe duplicated query path rather than layering another fallback chain on top of it.

## Verification
1. Run focused TypeScript/build validation for the changed training files.
2. Test as the affected client in a fresh browser session: open Training, expand Program, and confirm all six current-phase workouts render with working Start controls.
3. Repeat after clearing local storage to prove the result comes from the live backend rather than stale cache.
4. Test a warm revisit and Retry behavior, confirming no indefinite loader and no regression when thumbnail requests fail.
5. Verify the coach’s client Training workspace still shows the same program and workouts, and confirm no unrelated routes were changed.
