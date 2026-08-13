# Speed up the client profile page

## What's actually slow

Confirmed by reading `src/pages/ClientDetail.tsx` and the workspace tabs:

1. **The whole page is blocked behind four header queries.** `ClientDetail` renders a full-page skeleton (avatar + one big grey block) until profile, tags, active program and coach_clients all resolve. That is exactly what both screenshots show: no tabs, no content, just grey. Even the tab bar — which needs no data — waits.
2. **Every tab's code ships before the page can render.** All 11 tab components are static imports (~7,400 lines total, including a 1,755-line Training tab and a 1,262-line Calendar tab plus its charts). Opening one client downloads all of them.
3. **Tabs then start their own cold fan-out.** The Dash tab alone fires 4 queries, then 7 more, then a follow-up workout-session query, then one signed-URL call per photo — all after the header work has already finished, so the waits stack instead of overlapping.
4. **Nothing is cached between visits.** Re-opening the same client (or switching tabs and back) refetches everything from scratch.

## Plan

### 1. Render the shell immediately
Stop gating the page on the header fetch. Paint the back button, avatar placeholder, name (from router state when arriving from the client list) and the full tab bar right away; fill in name/tags/badges as they arrive. The active tab starts loading in parallel with the header instead of after it.

### 2. Lazy-load the tabs
Convert the 11 tab imports to `React.lazy` with a light per-tab skeleton fallback, and prefetch the tab the URL points at plus Dash. Result: opening a client downloads the header plus one tab, not all eleven.

### 3. Cache the client header and tab data
Add a short-lived per-client cache (same stale-while-revalidate pattern already used by `useClientProgram`) for the header query and for the Dash/Training/Calendar tab payloads, persisted so returning to a client you already opened paints instantly and revalidates in the background.

### 4. Trim the Dash fan-out
- Merge the follow-up `workout_sessions` completion check into the initial parallel batch instead of running it after.
- Replace the per-photo signed-URL loop with a single batched call.
- Move the "extended" block into the same parallel batch as the summary block so the two waves overlap.

### 5. Prefetch on hover from the client list
Warm the client-detail chunk and the header query when a coach hovers or touches a row in the client list, so the click lands on already-loaded code.

### 6. Verify
Measure time-to-first-paint and time-to-tab-content on the client profile before and after, and check the performance log for any remaining query over the 3s threshold.

## Technical notes

- Frontend only — no schema, RLS or index changes. Query filters stay identical; only batching, caching and code-splitting change.
- Files touched: `src/pages/ClientDetail.tsx`, the workspace tab components (imports + cache keys), `src/lib/routePrefetch.ts`, and the client list row component.
- The existing `useDataFetch` / snapshot caching utilities are reused rather than adding a new caching layer.

## Order of work

1. Shell-first render + lazy tabs (steps 1–2) — biggest visible win.
2. Caching (step 3).
3. Dash fan-out trim (step 4) and list prefetch (step 5), then verification.
