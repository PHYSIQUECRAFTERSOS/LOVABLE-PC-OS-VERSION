## Why mobile is fast but desktop web is slow

The native iOS/Android app is a Capacitor wrapper — the entire JS bundle is **shipped inside the app binary** and loads from local disk. There is no network download, no cold cache, no TLS handshake. That's why it feels instant.

Desktop web has to fetch the same bundle over the network on every cold load (and after every deploy, since the file hashes change). Right now that bundle is one enormous file because `src/App.tsx` statically imports all 40+ pages — Admin, Analytics, PDF exports, Charts, MasterLibraries, WorkoutBuilder, ClientDetail, etc. Even a client who only opens `/dashboard` downloads the entire coach + admin app.

The database is not the problem anymore — current snapshot is 24% memory, 19/90 connections, top query 8ms. This is purely a browser/network payload issue.

## Plan (desktop web only — no mobile impact)

All changes are frontend build-configuration and import-shape only. Nothing changes for the native app except it will also be slightly leaner.

### Step 1 — Route-level code splitting in `src/App.tsx`
Convert every page import to `React.lazy(() => import("./pages/X"))` and wrap `<Routes>` in `<Suspense fallback={<SplashGate />}>`. Keep `Index`, `Auth`, and `NotFound` eager so the login path stays instant.

Effect on desktop: the browser downloads a small shell + only the current route's chunk instead of the entire app. Typical drop for a coach loading `/clients/:id`: 60-80% smaller initial JS. First paint on a fresh desktop tab should improve by 2-5 seconds.

### Step 2 — Split vendor chunks in `vite.config.ts`
Current `manualChunks` groups only `vendor / ui / charts`. Expand so heavy libs are separate cache-friendly files:
- `pdf` chunk — `jspdf`, `html2canvas`, `src/utils/pdf/*` (loaded only when exporting a PDF).
- `charts` chunk — keep recharts isolated.
- `radix` chunk — all `@radix-ui/*`.
- `supabase` chunk — `@supabase/supabase-js`.

Effect: after the first visit, most navigations reuse cached chunks. Deploys only bust the chunks that actually changed, so returning users don't re-download everything.

### Step 3 — Lazy-load the two heavy dialogs
- `ImportFromMasterLibrary` (supplement plan import) — dynamic-import inside its parent, mount only when opened.
- `Day 1: UPPER` workout dialog on `ClientDetail` — same pattern; the exercise picker + workout builder are large.

These are the two "spins forever" dialogs from your earlier screenshots. Direct fix.

### Step 4 — Preconnect hints in `index.html`
Add `<link rel="preconnect">` for the Lovable Cloud URL so the first API call doesn't pay a fresh TLS handshake on cold desktop loads (~100-300ms saved). Also add `<link rel="dns-prefetch">` as a fallback for older browsers.

### Step 5 — Enable brotli-friendly, hashed asset caching
Confirm Vite's default hashed asset filenames are in use (they are) and that `index.html` has no long-lived cache header (Lovable hosting already does this). No code change unless something is misconfigured — I'll verify during build.

### Step 6 — Verify on desktop
- `npm run build` — compare emitted chunk sizes before/after (should show one big chunk splitting into ~15 smaller ones).
- Hard-reload `/dashboard` on desktop with DevTools Network tab open — confirm total JS transfer drops significantly.
- Open the two heavy dialogs — confirm they render quickly.

### What I will NOT touch
- No database migrations, RLS, or edge function changes.
- No changes to native (iOS/Android) code, Capacitor config, or the service worker cache policy.
- No auth, business logic, or schema changes.
- No dependency upgrades.

### Expected result on desktop web
- Cold-load first paint: 2-5 seconds faster.
- Returning-visit navigation: near-instant (cached chunks).
- The Import-from-Library and Day 1 workout dialogs: open in well under a second.
- Native app: unchanged behavior, marginally smaller install size.
