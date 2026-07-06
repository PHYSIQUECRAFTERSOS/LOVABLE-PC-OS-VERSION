
# Speed Pass v2 — kill the last visible slow spots

Screenshots show three real problems on mobile:

1. **Calendar** still shows "Failed to load. Tap to retry." — we never actually shipped the calendar RPC bundle from the last plan; `Calendar.tsx` is still firing 6+ round-trips with a hard 5s timeout.
2. **Nutrition → Plan** sits on "Loading…" and the food-log fetch throws `TypeError: Load failed` (a fetch was aborted or the network dropped mid-request, and the error is surfaced as a red toast instead of falling back to cache).
3. **Desktop feels slower than before** because every route change re-runs the unread-badge query, which does a per-thread `select count(*)` (N+1) on every message realtime event.

Plus the training prefetch we added only fires on the Training tab. Calendar and Nutrition get no prefetch at all.

## What to build

### 1. Finish the Calendar bundle (biggest single win)
- Add Postgres RPC `get_client_calendar_bundle(_client_id, _start, _end)` returning, in one round-trip: `calendar_events` (already joined to workout/cardio names), completed `workout_sessions`, `cardio_logs`, `weight_logs`, per-day aggregated `nutrition_logs` totals, and the `program_workouts` label map for the active phase. `SECURITY DEFINER`, checks `auth.uid() = _client_id OR is a coach/admin of that client`, `GRANT EXECUTE ... TO authenticated`.
- In `Calendar.tsx` client path, replace the 6 queries + the assignment/phase/pw chain with one `.rpc()` call. Coach path stays untouched.
- Drop the hardcoded `timeout: 5000` on the calendar query — let `useDataFetch` pick the mobile-tuned default (12s cold / 20s revalidate).

### 2. Fix the Nutrition "Load failed" toast and stuck Plan tab
- `DailyNutritionLog`: wrap the food-log fetch in the same SWR pattern as `useDataFetch` — on abort/network-error, if we have cached rows show them silently; only toast on a real error with no cache.
- `ClientNutritionHub` (Plan tab): the "Loading…" never resolves because the guides query fails silently on mobile. Add a real empty/error state and use `useDataFetch` so it inherits the persistent cache + timeout logic.
- Root cause of the abort: navigating tabs unmounts the log fetch mid-flight; `AbortError` currently bubbles as a red toast. Suppress `AbortError` in the toast path (still log to console).

### 3. Prefetch Calendar + Nutrition data on hover/touch
- In `AppLayout.tsx`, register data prefetchers for `/calendar` (calls the new bundle RPC for the client's rolling window) and `/nutrition` (primes today's food-log + macro targets) alongside the existing `/training` one.
- Because `NavLink` already fires `onTouchStart` → `prefetchRoute`, the data warms as the finger lands, before the tap completes. This is the "Trainerize instant" trick.

### 4. Kill the unread-badge N+1
- Replace the per-thread count loop in `AppLayout.fetchUnread` with a single RPC `get_unread_thread_count(_user_id, _is_coach)` that does the aggregation in SQL. Cuts up to ~30 sequential queries on coach login to one.
- Debounce the realtime handler to 500ms so a burst of message events doesn't refetch 10x in a second.

### 5. Small but visible wins
- Cache the `coach_clients.calendar_lookahead_days` lookup in `Calendar.tsx` (currently re-runs every mount) via `useDataFetch`.
- Preconnect to the Supabase origin in `index.html` (`<link rel="preconnect">` + `dns-prefetch`) so the first API call after cold boot doesn't pay TLS handshake cost.
- Add `fetchpriority="high"` to the logo/LCP image so mobile Safari doesn't defer it behind chunk JS.

## What we are NOT doing (out of scope)
- No schema changes to existing tables — everything is additive RPCs.
- No changes to coach-side Calendar/Training queries (already single-query).
- No design changes.

## Technical section

**New migration** — `supabase/migrations/<ts>_calendar_bundle_and_unread_count.sql`
- `create or replace function public.get_client_calendar_bundle(_client_id uuid, _start date, _end date) returns jsonb` — SECURITY DEFINER, guards with `auth.uid() = _client_id or exists(coach_clients where coach_id = auth.uid() and client_id = _client_id and status in ('active','subscribed'))` or admin role. Returns `jsonb_build_object('events', …, 'sessions', …, 'cardio', …, 'weights', …, 'nutrition_daily', …, 'workout_labels', …)`.
- `create or replace function public.get_unread_thread_count(_user_id uuid, _is_coach boolean) returns integer` — same "unread" definition as `CoachThreadList.tsx` (see comment in AppLayout).
- `grant execute on function … to authenticated;`

**Files to edit**
- `src/pages/Calendar.tsx` — swap client query fan-out for `supabase.rpc("get_client_calendar_bundle", …)`; drop `timeout: 5000`.
- `src/components/nutrition/DailyNutritionLog.tsx` — SWR the food-log fetch, suppress `AbortError` toast, keep console log.
- `src/components/nutrition/ClientNutritionHub.tsx` — use `useDataFetch`, add empty/error state.
- `src/components/AppLayout.tsx` — register `/calendar` + `/nutrition` data prefetchers; replace `fetchUnread` body with the new RPC; debounce realtime handler.
- `src/integrations/supabase/types.ts` — regenerated for new RPCs.
- `index.html` — add `<link rel="preconnect" href="https://<supabase-host>" crossorigin>` + `dns-prefetch`.

**Safety**
- RPCs are additive; if either fails at deploy time we fall back to current code paths with a try/catch guard around the RPC call.
- Persistent SWR cache is versioned + user-namespaced, so no cross-account leaks.
- Unread badge RPC returns the same integer the current code produces — no UI change.

## Expected impact
- Calendar cold-load on LTE: **~2.5s → ~600ms**, warm load: **instant from cache**.
- Nutrition Plan tab: no more infinite "Loading…", no more red "TypeError: Load failed" toast.
- Desktop nav clicks: unread badge no longer stalls the click on ~30 sequential DB round-trips.
- Overall: matches the "instant tab switch" behavior you see in Trainerize.
