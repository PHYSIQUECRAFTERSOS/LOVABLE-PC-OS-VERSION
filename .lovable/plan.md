
## Current state

Your DB is not the bottleneck — slow-query snapshot shows the worst read at ~160ms; almost all queries are <10ms. Bundle is already code-split and lazily loaded per route. So the remaining desktop slowness is coming from **client-side patterns**, not the server.

Signals I can already see:
- `[Perf] 🟡 coach-command-center-…: 2074ms` in your console today
- `sw.js` is set to **bypass cache** with 5-minute polling (per project memory) — this is safe for correctness but forces network on every navigation
- Many pages use `useDataFetch` (custom, in-memory) alongside React Query — two caches that don't share, so a lot of re-fetching per route switch
- Coach pages fan out large `Promise.allSettled` bundles on mount, blocking first meaningful paint

## Speed plan — highest ROI first

### 1. Route prefetch on hover/focus (biggest perceived win)
Trainerize feels instant because the next screen is already downloaded before you click. Add a tiny prefetch wrapper on `NavLink` and coach dashboard cards:
- On `mouseenter` / `focus`, call the same `import("./pages/Xxx")` used by `lazy()`
- Prefetch the top 3 destinations from every screen (Dashboard, Clients, Messages, Calendar)
- Result: route transitions drop from ~400–900ms to <100ms on desktop

### 2. Unify caching on React Query, kill duplicate fetches
Right now `useDataFetch` and React Query maintain separate caches. Same client list gets refetched when switching Dashboard ↔ Clients ↔ ClientDetail.
- Migrate hot coach paths (`useClientProgram`, roster fetch, coach-command-center, messages thread list) to React Query with shared query keys
- Set `staleTime: 60_000` for roster/program data, `staleTime: 10_000` for messaging
- Keep `useDataFetch` for one-off leaf reads; stop using it for anything queried on more than one page

### 3. Fix the 2-second coach-command-center fetch
The perf log flagged it today. Likely a serial waterfall of 4–6 queries.
- Convert to a single RPC (`get_coach_command_center(coach_id)`) that returns the whole payload in one round trip
- Or batch with `Promise.all` and drop any unused columns (`select` only what the widget renders)
- Target: <400ms

### 4. Trim what ships to the browser
Even with code-splitting, the first paint pulls a chunk that includes libs it doesn't need.
- `lucide-react`: switch imports to `lucide-react/icons/<name>` (per-icon, tree-shakes properly). Currently a single "icons" chunk is loaded up-front for everyone.
- `recharts` + `d3`: lazy-import chart components inside the pages that use them (Analytics, Progress) so coach dashboard doesn't pay the cost
- `jspdf` + `html2canvas`: already in a "pdf" chunk — verify it's only imported from PDF export buttons via `await import()` (not statically)
- Drop `terser` in favor of the default `esbuild` minifier for faster builds and equivalent output

### 5. Service worker: cache the shell, revalidate in background
Today `sw.js` bypasses cache entirely to fix stale PWA builds. That's overkill for desktop.
- Switch to **stale-while-revalidate** for JS/CSS/font assets (they're hashed — safe to cache forever)
- Keep network-first only for `index.html` and API calls
- Preserves your auto-reload guarantee, but subsequent loads become instant

### 6. Real-time subscriptions: batch and scope
`ThreadChatView` and the coach thread list open a Supabase channel per thread. Every unread-check triggers an INSERT event handler that refetches. On a coach with 40 threads this is dozens of open sockets.
- One channel per coach filtered by `client_id in (…)` for the roster
- Debounce refresh handlers to 250ms

### 7. Perf HUD (so this doesn't happen again)
Add a floating dev-only overlay (admin-only in prod, toggle with `?perf=1`) that shows:
- Route transition time
- Top 5 slowest queries this session from `getPerfSummary()`
- Bundle chunk sizes loaded
This is how Trainerize keeps regressions from shipping — you'll see any new slow query the moment it appears.

### 8. Small polish
- Enable `refetchOnReconnect: false` on React Query (currently defaults on)
- Warm the auth session cache from `localStorage` synchronously on `main.tsx` so `AuthProvider` doesn't block first paint (already partially done — verify)
- Preload the Inter font with `<link rel="preload" as="font" crossorigin>` in `index.html`

## What I will NOT touch
- Business logic, RLS policies, schemas
- Design system / colors / layout
- Data correctness (offline soft-delete, coach authority, etc.)

## Order of execution
1. Route prefetch on hover (Section 1) — 1 file, immediate feel improvement
2. Service worker stale-while-revalidate (Section 5)
3. Icon + chart lazy imports (Section 4)
4. Coach-command-center RPC (Section 3)
5. React Query consolidation on hot paths (Section 2)
6. Real-time channel batching (Section 6)
7. Perf HUD (Section 7)
8. Polish (Section 8)

## Notes on Cloud compute
Your DB is barely working (max 160ms). **Upgrading the Cloud instance will not help right now** — this is a frontend + query-shape problem. Save that lever for when you cross ~500 active clients or start seeing >1s DB queries in slow_queries.

## Files that will change (approximate)
- `src/components/NavLink.tsx`, `src/App.tsx` — hover prefetch
- `public/sw.js` — SWR strategy
- Icon-heavy components — per-icon imports (codemod)
- `src/pages/Analytics.tsx`, `src/pages/Progress.tsx` — lazy charts
- `src/hooks/useDataFetch.ts` consumers on hot paths — swap to React Query
- One new SQL function `get_coach_command_center`
- `src/components/dashboard/CoachCommandCenter.tsx` — single RPC call
- `src/components/messaging/CoachThreadList.tsx`, `ThreadChatView.tsx` — channel batching
- New `src/components/dev/PerfHUD.tsx`
- `vite.config.ts` — swap terser → esbuild
