# Physique Crafters OS: Command Center Resilience Fix (Phase 2, Step 1 of 3)

## STOP. SCOPE THIS TIGHTLY.

This is Step 1 of a 3-step fix sequence approved after the Phase 1 diagnostic. Implement ONLY the change described here, in ONLY the Command Center component. Do not touch Master Libraries, ProgramDetailView, RLS, indexes, or the shared `useDataFetch` hook's behavior for other callers. Do NOT add owner-column query predicates in this step, that is Step 3. If you find yourself editing any file other than the Command Center component, stop and report.

## ROLE

You are a senior full stack engineer working inside my Lovable project for "Physique Crafters OS". Make one precise, contained change.

## CONFIRMED ROOT CAUSE (from Phase 1 diagnostic, already verified)

`src/components/dashboard/CoachCommandCenter.tsx` fans out 6 parallel Supabase queries using `Promise.all` with a shared 5000 ms AbortController. When any single query exceeds the 5 s wall clock (typically the roster-wide `calendar_events` 7-day query or the `messages` query), the shared AbortController cancels all six and the fetcher returns an all-zeros fallback. The dashboard then renders every card as 0 or empty even though the data exists (39 active clients confirmed in `coach_clients`). This is why the dashboard shows "nothing loaded". Using `Promise.all` here also violates the project invariant that parallel fetches must use `Promise.allSettled`.

## THE FIX (single logical change)

Make the Command Center fan-out resilient so a slow or failed individual query can never blank the entire dashboard.

1. Replace `Promise.all` with `Promise.allSettled` for the six-query fan-out.
2. Handle each query's result independently. A fulfilled query populates its own card. A rejected or timed-out query falls back to that card's own empty state only, ideally showing a brief per-card loading or "unavailable" indicator, without affecting the other five cards.
3. Remove the shared all-or-nothing 5000 ms abort that cancels every query. If you want a timeout, apply it per query so one slow query cannot cancel its siblings. The fast queries (`coach_clients`, `profiles`, `workout_sessions`, `client_risk_scores`) must render immediately with their real values.
4. Do NOT change the queries themselves in this step. No new WHERE predicates, no column changes, no RLS. Only the orchestration and result handling change.

## IMPLEMENTATION CONSTRAINTS

- Edit only `src/components/dashboard/CoachCommandCenter.tsx`. Edit it in place. Do not recreate it.
- Do NOT modify `src/hooks/useDataFetch.ts` in any way that changes behavior for other callers. It is a shared hook. Achieve the resilient fan-out by changing how the Command Center orchestrates and handles its queries. If you believe `useDataFetch` itself must change, STOP and report before editing it.
- Do NOT add owner-column predicates to `calendar_events` or `messages` in this step. That is Step 3 and requires separate verification.
- Do NOT modify any RLS policy, index, schema, or migration.
- Preserve `calendar_events` as the single source of truth for completion state.
- Preserve `en-CA` local date formatting for the "yesterday" and "last 7 days" calculations. Do not switch to UTC.
- Use `Promise.allSettled`, never `Promise.all`.
- "Track Water" must not appear anywhere. If encountered in this file, remove it.

## ACCEPTANCE CRITERIA (all mandatory)

1. The fan-out uses `Promise.allSettled`, not `Promise.all`.
2. Every card whose underlying query succeeds renders its real value on load, regardless of whether other queries are still pending or have failed.
3. No card displays 0 or "none" when its own underlying query returned data. Specifically, the active client count reflects the real `coach_clients` rows.
4. A single slow or failed query never cancels or zeroes the other queries or cards.
5. `useDataFetch` behavior is unchanged for every other screen that uses it.
6. No RLS policy, index, schema, or query predicate was changed.
7. Date logic still uses `en-CA` local formatting, not UTC.

## DO NOT TOUCH

- Master Libraries, `ProgramDetailView`, `ProgramOverviewPane`, `useClientProgram`.
- RLS policies, indexes, schema, migrations.
- The shared `useDataFetch` hook's contract or behavior for other callers.
- Query predicates or owner filters on `calendar_events` and `messages` (deferred to Step 3).
- Desktop and mobile layout.
- `getDisplayPosition()`, the `calendar_events` source-of-truth rule, `en-CA` formatting.

## AFTER IMPLEMENTING, REPORT

- Which lines changed in the Command Center component.
- Confirmation that the fast cards now populate with real data on load.
- Confirmation that the two heavy cards resolve on their own without zeroing the rest of the dashboard.
- Do not proceed to Master Libraries or the query-predicate optimization. Those are separate approved steps.
- &nbsp;