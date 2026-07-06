
## Diagnosis

Symptoms from your screenshots + console:
- Messages page: infinite spinner (desktop, coach view)
- Training page: infinite spinner (mobile)
- Dashboard: console shows `coach-command-center-… took 5927ms (>3s limit)`

Cross-referencing what we changed in the last hour:

### 1. The persistent SWR cache is doing synchronous localStorage I/O on every fetch
In `useDataFetch.ts`, `hydrateFromDisk` runs on every hook mount and every `fetchData` call — it does a synchronous `localStorage.getItem` + `JSON.parse`. `savePersisted` runs a synchronous `JSON.stringify` + `setItem` after every successful fetch. On mobile Safari, large payloads (nutrition logs, calendar bundles, coach command-center data) block the main thread for hundreds of ms each. This is almost certainly why the app now *feels* slower after the "improvements".

### 2. Timeout escalation actually made hangs longer
Old behavior: caller-provided `timeout: 5000` → abort at 5s → show "Failed to load, retry".
New behavior: `Math.max(baseTimeout, 12000)` on cold load, `Math.max(baseTimeout * 3, 20000)` when cached. So a genuinely stuck request now shows a spinner for **12–20 seconds** instead of failing fast. That matches the infinite-spinner screenshots exactly.

### 3. Prefetchers fire duplicate work
`registerRouteDataPrefetch` in AppLayout kicks off `.from("calendar_events").select("id").limit(1)` etc. on hover — but the actual pages use *different* cache keys and *different* selects, so the prefetched row is discarded. It's pure overhead: extra DB round-trips + more localStorage writes, zero cache hits.

### 4. Nothing here explains the 5.9s coach-command-center query
That's a separate DB-side slowness (pre-existing) and needs its own investigation — not something the recent code changes caused or can fix from the client.

## Targeted Fix (no full revert)

Keep the wins that are actually working (route JS chunk prefetch on hover, unread badge debounce, Calendar parallelization, suppressed AbortError toasts). Rip out the parts that regressed things.

### Changes

**`src/hooks/useDataFetch.ts`**
- Remove the persistent localStorage cache entirely: delete `loadPersisted` / `savePersisted` / `deletePersisted*` / `hydrateFromDisk` and the `PERSIST_*` constants. Keep only the in-memory `Map` cache.
- Revert the timeout logic to honor the caller's `timeout` value exactly. Drop the `Math.max(baseTimeout, 12000)` and the `cached ? baseTimeout*3 : …` escalation. If a caller passes `timeout: 5000`, it aborts at 5s like before.
- `invalidateCache` / `invalidateCacheByPrefix` / `clearCache` go back to memory-only.
- `primeQuery` stays (memory-only) — the JS-chunk prefetch path still uses it harmlessly.

**`src/components/AppLayout.tsx`**
- Remove the entire second `useEffect` (lines ~62–135) that calls `registerRouteDataPrefetch` for `/training`, `/calendar`, `/nutrition`. It's producing wasted DB round-trips with no cache hit.
- Keep the JS-chunk `warmClientRoutes` / `warmCoachRoutes` call — that one genuinely helps.
- Keep the unread-badge 500ms debounce — that's a real win.

**`src/lib/routePrefetch.ts`**
- Keep `registerRouteDataPrefetch` as a no-op-friendly registry (still called by any lingering imports) — no behavior change needed here.

**`src/pages/Calendar.tsx`**
- Keep the parallelized label-chain change — that's a genuine win, not a regression.

**`src/pages/Training.tsx`**
- Keep the RPC call for clients — it's fewer round-trips. The infinite spinner was the 12s timeout floor, which #1 fixes.

**`src/components/nutrition/DailyNutritionLog.tsx`**
- Keep the AbortError toast suppression — it prevents legit false-alarm errors.

### What I am NOT touching
- The `get_client_training_workouts` and `get_client_calendar_bundle` RPCs (if the second one was created) — they don't cost anything to leave in place, and reverting DB objects has risk.
- The Master Libraries visibility migrations from earlier — unrelated to perf.

### Expected effect
- localStorage sync writes gone → mobile main-thread frees up on every data fetch.
- 5s timeouts abort at 5s again → no more 12s "infinite" spinners.
- Prefetcher overhead gone → fewer background DB calls competing with the real page load.

### Separately (not in this change, needs your OK)
The 5.9s `coach-command-center` query is the biggest single perf issue you have and is a DB-side problem. Want me to open that as a follow-up after this revert lands?
