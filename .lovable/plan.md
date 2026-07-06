
# Mobile Speed Pass — Calendar & Training

Goal: match Trainerize-level "instant" feel when opening Calendar and Training on mobile. Focus is the two screens you called out; the changes reuse patterns we already put in for desktop.

## What's slow today (measured from the code)

**Calendar (`src/pages/Calendar.tsx`)**
- On every open it fires **6 separate queries** in parallel (`calendar_events`, `workout_sessions`, `cardio_logs`, `nutrition_logs`, `weight_logs`, plus a `client_program_assignments` → `program_phases` → `program_workouts` chain for the label map).
- On LTE, each round-trip is ~300–800ms. The 5s timeout then trips and you see "Failed to load. Tap to retry." (your screenshot).
- Cache is in-memory only. First navigation after a cold app open = no cache → full fan-out → skeleton for 2–5s.

**Training (`src/pages/Training.tsx`)**
- Client path is **sequential**: `client_program_assignments` → (`program_phases` + `program_weeks`) → `program_workouts` → `workouts`. Four serial round-trips before anything renders.
- Then `ClientProgramView` does its own additional fetches for exercises/meta.
- Same in-memory-only cache issue.

## Plan

### 1. Persistent SWR cache (biggest single win)
Extend `useDataFetch` so cache entries are mirrored to `localStorage` under a versioned key. On mount:
- If a cached entry exists (even if stale), render it **immediately** and revalidate in the background.
- Only show the skeleton when there is genuinely no cached data.
- Cap stored payload size and skip persistence for huge blobs.

Result: Calendar & Training paint in <100ms on repeat visits, exactly like Trainerize's "instant" feel. First-ever load is unchanged.

### 2. Consolidate Calendar into one RPC
Add a Postgres function `get_client_calendar_bundle(_user_id, _start, _end)` that returns:
- calendar_events (with joined workout/cardio names)
- completed workout_sessions in range
- cardio_logs in range
- weight_logs in range
- aggregated daily nutrition totals in range (avoid pulling every meal row)
- the program_workouts label map for the client's active phase

Replace the six client-side queries with a single `.rpc()` call. Cuts Calendar to **1 round-trip** instead of 6, and moves the nutrition aggregation to the DB (already indexed).

Coach view keeps its existing narrower query path — no behavior change for coach.

### 3. Consolidate Training client fetch
Add `get_client_training_workouts(_user_id)` that returns the deduped `workouts` rows for all active assignments in one call (does the phases/weeks/program_workouts join server-side). Replaces the 4-step chain with **1 round-trip**.

Coach path (`workouts` by `coach_id`) is already one query — leave it alone.

### 4. Prefetch Calendar & Training data on tab hover/touch
We already prefetch the route chunks. Extend `routePrefetch.ts` to optionally run a data prefetch callback. Register the Calendar and Training query functions so hovering the bottom-nav icon warms the cache before the tap lands. On mobile, use `touchstart` (already wired in `NavLink`).

### 5. Tune timeouts for mobile
- Raise the hard timeout from 5s to 12s for the initial fetch (LTE reality), but **only when we have no cache to show**. When cache exists, revalidation runs silently with no user-visible timeout.
- Show the "Retry" state only after a real failure, not a slow network — the persistent cache path means users almost never see it.

### 6. Small cleanups
- Drop the `console.log` calls in `Training.tsx` `queryFn` (they run on every load).
- Reduce Calendar's client date window overhead by only fetching the visible week on week view instead of the 30-day back window when `view === "week"` on coach path (client keeps rolling window).

## Technical section

**Files to add**
- `supabase/migrations/<ts>_calendar_and_training_bundles.sql` — two `SECURITY DEFINER` functions above with `GRANT EXECUTE ... TO authenticated`. Both respect existing RLS by filtering on `auth.uid()` / passed `_user_id` equality check.

**Files to edit**
- `src/hooks/useDataFetch.ts` — add localStorage persistence layer, stale-while-revalidate render path, per-key size cap, timeout gating.
- `src/pages/Calendar.tsx` — swap fan-out for `supabase.rpc("get_client_calendar_bundle", …)` on client role; keep coach path.
- `src/pages/Training.tsx` — swap client chain for `supabase.rpc("get_client_training_workouts", …)`; remove debug logs.
- `src/lib/routePrefetch.ts` + `src/components/NavLink.tsx` — accept optional `dataPrefetch()` and invoke on hover/touch.
- `src/components/AppLayout.tsx` — register calendar/training data prefetchers alongside the route imports.
- `src/integrations/supabase/types.ts` — regenerated for the two new RPCs.

**Risk & safety**
- No schema changes, no destructive SQL. New RPCs are additive; if they fail we can fall back to the current queries.
- Persistent cache is namespaced by user id and app version so stale data can't leak between accounts or survive a deploy.
- Coach flows and admin flows are untouched except for the shared cache upgrade (which only makes them faster).
