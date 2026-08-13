# Make the app load fast (desktop + mobile)

## What I measured first

- **Startup payload is the biggest single cost.** Every page load downloads ~790 KB compressed of JavaScript before anything renders. The largest piece is a 439 KB shared chunk, and a **167 KB PDF-export library is loaded eagerly on every page** because the legal-documents module imports it at the top level (it is only needed when someone actually exports a PDF).
- **The database itself is not the problem.** All hot tables are small (13.7k calendar events, 49k nutrition logs, 6.3k messages) and already well indexed — several indexes are even duplicated. Database health is fine (37% memory, 42/90 connections).
- **Cost is per-request, not per-row.** In the query log even a 47-row single-user lookup took seconds. That points at round-trip count and cold-start latency, not query work — so the fix is *fewer, smaller requests*, not more indexes.
- **The coach dashboard fans out 6 queries, two of them unscoped.** The 7-day calendar query and the messages query have no client/conversation filter — they pull every row the security rules allow and filter in the browser. The console shows this card taking 4.8 s.

## Plan

### 1. Cut the startup bundle (biggest win, affects every page)
- Make the PDF library load on demand only. Split `legalDocuments.tsx` so the jsPDF import moves behind a dynamic import used at export time; same for the branded-PDF utilities.
- Re-tune the chunking so the shared 439 KB chunk is split by usage: animation library, charts, date utilities and drag-and-drop should be their own async chunks, not part of the initial download.
- Audit what the app shell (`App.tsx`, `AppLayout.tsx`, `useAuth`) pulls in transitively and lazy-load anything that is not needed for first paint.
- Target: initial JS under ~300 KB compressed (from ~790 KB).

### 2. Fix the coach Command Center (4.8 s → target under 1 s)
- Scope the two unscoped queries: filter the 7-day calendar query and yesterday's calendar query to the coach's client IDs, and filter the messages query to the coach's conversations.
- Select only the columns each card actually renders and cap row counts.
- Render cards progressively: show each section as its own data lands instead of waiting for the whole fan-out.

### 3. Make repeat navigation instant
- Persist the existing in-memory cache to `localStorage` for the dashboard, calendar and meal-plan keys so returning to a page (or reopening the mobile app after it was evicted) paints from the last known data immediately, then revalidates in the background.
- Extend the existing route prefetch so tapping a nav item never waits on a chunk download.

### 4. Trim the heaviest remaining screens
- Apply the same treatment (scoped columns, capped rows, cached first paint) to the meal-plan/nutrition screen and the calendar screen, which the user reports as slow on mobile.

### 5. Verify
- Re-measure bundle size and the published page load, and re-check the performance log for any query still over the 3 s threshold.

## Technical notes

- No schema or security-rule changes are needed; indexes are already in place and data volume is small.
- All changes are frontend: `vite.config.ts` chunking, dynamic imports, query shape in `CoachCommandCenter.tsx`, and the caching layer in `useDataFetch.ts` / `dashboardSnapshot.ts`.
- Duplicate indexes exist (e.g. `idx_calendar_events_date` vs `idx_calendar_events_user_date`); dropping the redundant ones is optional cleanup that speeds up writes slightly — not included unless you want it.

## Order of work

1. Bundle split (steps 1) — ships fastest, helps every page and both platforms.
2. Command Center query scoping (step 2).
3. Persistent cache + prefetch (step 3).
4. Nutrition/calendar screens (step 4), then verification (step 5).
