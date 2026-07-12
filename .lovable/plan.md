
# Stale-Build Fix — Approved Implementation Plan (A + B + C + CDN header)

## Root cause (confirmed)
On a normal reload, the browser can serve `index.html` from its own HTTP cache before the SW wakes. The stale HTML points at old hashed bundle URLs, which the SW's `staleWhileRevalidate` returns from its own cache. New SW discovery is lazy (5-min interval only), and `/sw.js` itself may be edge-cached, so the browser's native SW update check can also see stale bytes for up to 24h.

## Changes

### A. `public/sw.js` — stop caching HTML
- Bump `CACHE_NAME` to `physique-crafters-v13` (evicts old entries on activate).
- New `NEVER_CACHE_PATHS` set: `/version.json`, `/manifest.json`, `/sw.js` → always `fetch(..., { cache: 'no-store' })`.
- Navigation requests (`request.mode === 'navigate'`) → **network-only** with `cache: 'no-store'`, no cache read/write. Offline fallback unchanged.
- Hashed assets → still `staleWhileRevalidate` (safe: new hash = new URL).
- Other same-origin GETs → still `networkFirst`.
- API/backend + cross-origin pass-through unchanged.

### B. `src/main.tsx` — aggressive update discovery
- Keep existing `updatefound` → `activated` → `location.reload()` flow (unchanged).
- Call `registration.update()` **immediately after `ready`**.
- Call `registration.update()` on `document.visibilitychange` → visible.
- Call `registration.update()` on `window.focus`.
- Keep the 5-min interval as a floor.
- Add a lightweight `/version.json` heartbeat: on boot + on visible/focus, `fetch('/version.json', { cache: 'no-store' })`; if `buildId` differs from `__BUILD_ID__`, trigger `registration.update()` (SW path then reloads on activate).

### C. Build-ID injection
- `vite.config.ts`: compute `BUILD_ID` (env `VITE_BUILD_ID` / `COMMIT_REF` / `VERCEL_GIT_COMMIT_SHA` / `Date.now()` fallback). Add `define: { __BUILD_ID__: JSON.stringify(BUILD_ID) }`. Add a small Vite plugin that emits `dist/version.json` with `{ buildId, builtAt }`.
- `src/vite-env.d.ts`: declare `__BUILD_ID__`.
- No `index.html` change needed — the check runs from `main.tsx`.

### D. `/sw.js` CDN cache header (per your addition)
- Lovable hosting sets response headers; there is no project-level CDN config file I can commit that will guarantee a specific header on `/sw.js` for this host. I will:
  1. Ship the code changes above (which make the app deploy-safe even if `/sw.js` byte-check is slow — the `/version.json` heartbeat + focus/visibility `update()` calls force discovery).
  2. In the changelog, explicitly document that `/sw.js` should be served with `Cache-Control: no-cache` (or `max-age=0`) and verify what Lovable hosting currently returns via `curl -I https://app.physiquecrafters.com/sw.js` after deploy. If the header is wrong, we escalate to hosting — no in-repo fix can override it.

## No-touch list (guardrails, will be verified in changelog)
- `localStorage` read/write anywhere — untouched.
- `ios-plugin/CacheBusterPlugin.swift` — untouched.
- `src/lib/dashboardSnapshot.ts` and all hydration paths — untouched.
- `src/hooks/useAuth.tsx`, `src/lib/authRecovery.ts` — untouched.
- Capacitor branch in `index.html` (SW unregister) — untouched.

## Files changed
| File | Change |
|---|---|
| `public/sw.js` | Navigation network-only; never-cache list; CACHE_NAME v13 |
| `src/main.tsx` | `update()` on ready/visible/focus; `/version.json` heartbeat |
| `vite.config.ts` | `__BUILD_ID__` define + `version.json` emit plugin |
| `src/vite-env.d.ts` | `__BUILD_ID__` declaration |

## Post-implementation deliverables
1. File-by-file changelog.
2. Grep confirmation that no `localStorage` / snapshot / auth code was touched.
3. `curl -I` output for `/sw.js` after deploy, with a clear pass/fail on the cache header.
4. Verification steps for desktop; you verify on iOS.

**Approve to switch to build mode and execute.**
