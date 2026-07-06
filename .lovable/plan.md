# Physique Crafters OS: Client Dashboard Card Resilience (Client Fix, Step 1 of 3)

## STOP. SCOPE THIS TIGHTLY.

This is the first of three approved client-side fixes from the read-only diagnostic. Implement ONLY this change, in ONLY the three card components named. Do NOT touch `useDataFetch`, the Calendar, the HealthKit hook, `ProgressWidgetGrid`, the CacheBuster plugin, native lifecycle code, or any coach-side work. Those are separate items. If you find yourself editing anything other than the three card files below, stop and report.

## ROLE

You are a senior full stack engineer working inside my Lovable project for "Physique Crafters OS" (React, TypeScript, Capacitor native iOS, Supabase). Make one precise, contained change that mirrors a fix already validated elsewhere in this project.

## CONFIRMED ROOT CAUSE (from the read-only diagnostic, already verified)

On the client Home dashboard, three cards each wrap their Supabase sub-queries in `Promise.all` with a shared abort signal, a hard `timeout: 5000` passed to `useDataFetch`, and a zero or empty fallback. When any single sub-query exceeds about 5 seconds (common on a cold radio after resume, or a cold Postgres plan), the whole `Promise.all` aborts and the card renders its empty fallback. Because each card has its own independent timeout, whichever card's slowest sub-query crosses 5 seconds on a given cold load is the one that blanks, so the failures look random. This is the exact all-or-nothing pattern that was removed from the coach Command Center in the earlier Step 1 fix, still present here at the card level.

The affected cards and lines:

- `src/components/dashboard/MacroSummary.tsx` (around line 31): `Promise.all([logs, targets, resolveDayType(...)])`, shared signal, `timeout: 5000`, zero-targets fallback.
- `src/components/dashboard/TodayActions.tsx` (around lines 147 and 177): two consecutive `Promise.all(...)` batches, shared signal, `timeout: 5000`, empty-array fallback.
- `src/components/dashboard/ProgressMomentum.tsx` (around line 34): `Promise.all([weights, sessions, metrics])`, shared signal, `timeout: 5000`, and NO fallback, so it stays undefined and blank on failure.

## THE FIX (single logical change, applied to all three cards)

Make each card resilient so one slow or failed sub-query can no longer blank the whole card, mirroring the coach Step 1 fix (`Promise.allSettled` plus per-source handling).

1. In each of the three cards, replace `Promise.all([...])` with `Promise.allSettled([...])`.
2. Handle each settled result independently: use the resolved value when a sub-query fulfilled, and a sensible per-source fallback when it rejected or aborted (for example an empty logs array, the existing zero-targets shape, an empty weight history). A single failed sub-query must degrade only its own piece, and the card must render with whatever data did resolve rather than blanking entirely.
3. For `TodayActions`, apply this to BOTH `Promise.all` batches (the two lines around 147 and 177).
4. For `ProgressMomentum`, which currently has no fallback, add per-source fallbacks so it shows partial or empty values instead of staying undefined and blank.
5. Remove the explicit `timeout: 5000` passed to `useDataFetch` from these three cards so they inherit the hook's mobile-tuned default timeout (longer than 5 seconds). This stops the premature blanking on a cold radio. Do NOT change `useDataFetch` itself or its defaults.
6. Do NOT change what any card displays, or the queries themselves, or the cache keys or stale times. Only the orchestration (allSettled plus per-source fallback) and the removal of the hard 5 second timeout change.

## IMPLEMENTATION CONSTRAINTS

- Edit only `MacroSummary.tsx`, `TodayActions.tsx`, and `ProgressMomentum.tsx`. Edit in place, do not recreate them.
- Do NOT modify `src/hooks/useDataFetch.ts` or its default timeout. The change is at the card level only.
- Do NOT touch the Calendar (already resilient), `ProgressWidgetGrid`, the HealthKit hook, the CacheBuster plugin, or any native lifecycle code. Those are separate steps.
- Preserve every card's displayed content, queries, cache keys, and stale times exactly.
- Preserve `en-CA` local date formatting (`getLocalDateString` / `toLocalDateString`). Do not switch to UTC.
- Use `Promise.allSettled`, never `Promise.all`.
- Preserve `calendar_events` as the single source of truth for completion state.
- "Track Water" and `water_logs` are out of scope. If encountered, leave them.

## ACCEPTANCE CRITERIA (all mandatory)

1. `MacroSummary`, `TodayActions` (both batches), and `ProgressMomentum` use `Promise.allSettled`, not `Promise.all`.
2. When one sub-query is slow or fails, the affected card now renders with whatever data resolved, using a per-source fallback for the missing piece, instead of blanking the whole card.
3. `ProgressMomentum` no longer stays blank on a failed sub-query, it shows partial or empty values.
4. The three cards no longer pass `timeout: 5000` and now inherit the hook's default timeout.
5. Each card's displayed content, queries, cache keys, and stale times are unchanged.
6. `useDataFetch` is unchanged for all callers.
7. `en-CA` date formatting is preserved.

## DO NOT TOUCH

- `useDataFetch` and its defaults.
- Calendar, `ProgressWidgetGrid`, the HealthKit hook, CacheBuster, and native lifecycle code (separate steps).
- Any coach-side work, the bundle fix, image transforms, or the Web Vitals reporter.
- RLS policies, indexes, schema, migrations.
- `getDisplayPosition()`, the `calendar_events` source-of-truth rule, `en-CA` formatting.

## AFTER IMPLEMENTING, REPORT

- The exact lines changed in each of the three files.
- Confirmation that all three now use `Promise.allSettled` with per-source fallbacks and no longer pass `timeout: 5000`.
- Confirmation that a slow or failed sub-query now leaves the card showing partial data rather than blank.
- Do not proceed to the tab-switch caching or the resume-lifecycle steps. Those are separate approved prompts.