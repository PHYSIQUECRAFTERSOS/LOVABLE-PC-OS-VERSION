## Fast Resume Diagnostic — Findings Report (Read-Only)

No files, plugins, native code, or config were modified. `CacheBuster` is not proposed to be changed. This report answers all six confirmation points and gives a clear go/no-go.

### 1. CacheBuster scope — what it actually clears

`ios-plugin/CacheBusterPlugin.swift` (lines 13–35) does exactly two things on cold launch:

- `URLCache.shared.removeAllCachedResponses()` — HTTP-level cache only.
- `WKWebsiteDataStore.default().removeData(ofTypes: …)` with this exact set:
  - `WKWebsiteDataTypeDiskCache`
  - `WKWebsiteDataTypeMemoryCache`
  - `WKWebsiteDataTypeOfflineWebApplicationCache`
  - `WKWebsiteDataTypeFetchCache`
  - `WKWebsiteDataTypeServiceWorkerRegistrations`

Critically, the set does NOT include `WKWebsiteDataTypeLocalStorage`, `WKWebsiteDataTypeSessionStorage`, `WKWebsiteDataTypeIndexedDBDatabases`, or `WKWebsiteDataTypeCookies`. So webview `localStorage` also survives (that is how the Supabase session persists — see below), even though the naming "CacheBuster clears web storage" is loose. It clears web *caches* (HTTP/fetch/SW), not key-value web storage.

CacheBuster does not touch anything in native land: it never reads or writes iOS `UserDefaults`, the Capacitor `Preferences` container, the app sandbox `Documents`/`Library` directories, or the Keychain. **Native key-value storage is fully outside CacheBuster's blast radius.**

### 2. Native storage availability

- `@capacitor/app` **is** installed (`package.json`, used by `useHealthSync.ts`, `usePushNotifications.ts`, `InlineRestTimer.tsx`).
- `@capacitor/preferences` is **not installed**. No other native KV plugin is present.

To land the snapshot on native storage, `@capacitor/preferences` (thin wrapper over iOS `UserDefaults` / Android `SharedPreferences`) would need to be added. It's a first-party Capacitor plugin, zero native Swift required, and adding it does not change any existing plugin.

### 3. Auth survival path — will a snapshot interfere?

Supabase client (`src/integrations/supabase/client.ts`) is configured with `storage: localStorage, persistSession: true, autoRefreshToken: true`. The session token lives in webview `localStorage` under the standard `sb-*-auth-token` key. As established in point 1, `WKWebsiteDataTypeLocalStorage` is NOT in CacheBuster's cleared set, so the session survives the wipe. `AuthProvider` (`src/hooks/useAuth.tsx` lines 262–302) then calls `supabase.auth.getSession()` on mount, which reads from that surviving `localStorage` entry, and additionally reads cached roles from `localStorage` under `pc_cached_roles:*` (lines 33–56).

A separate snapshot written to `@capacitor/preferences` is in a completely different storage container (native `UserDefaults`), on a different key namespace, and is never read or written by the Supabase JS client or `AuthProvider`. **There is zero interference risk with login/session restore.** The snapshot is display-cache only; auth continues to hydrate from `localStorage` exactly as today.

### 4. Snapshot contents & version guard

Minimum viable "last known dashboard" snapshot for the client Home cards. All values are already visible to the client on that same device — no new sensitivity:

- `steps` (today's step count + step goal)
- `walking_running_distance_km`
- `macros.totals` (calories, protein, carbs, fat) + `macros.targets` + `dayType`
- `todayActions.counts` (scheduled / completed workouts, cardio, nutrition-logged flag)
- `progressMomentum` (weightChange, currentWeight, workoutCompletion %, stepAvg)
- `caloriesToday`
- Small metadata: `userId`, `localDate` (en-CA), `writtenAt` (ms epoch).

Estimated size: well under 2 KB JSON per user. `UserDefaults` handles this trivially.

**Version guard (essential — builds ship several times a week):**

- Key snapshot under `pc_dashboard_snapshot:v<N>:<userId>:<localDate>` with an explicit integer `SNAPSHOT_VERSION`.
- On read, validate: version matches, `userId` matches current session, `localDate === getLocalDateString()`, and each field passes a shape check (numbers are numbers, arrays are arrays). Any mismatch → discard and fall through to the normal skeleton, then normal fetch.
- On writer-side bump: increment `SNAPSHOT_VERSION` in the same commit that changes the shape; older snapshots become invisible automatically.
- Also apply a max-age (e.g. 24 h) so stale snapshots from a device left cold for days do not flash old numbers.

### 5. Short-background resume listener

Yes, worth adding — it addresses a different case from cold-boot eviction:

- **Cold boot (webview evicted, ≥ ~20 min):** JS reboots, `CacheBuster` runs, snapshot hydrates instant paint, then background fetch. This is what the native snapshot solves.
- **Warm resume (webview alive, < ~20 min):** JS state is intact, but the tab may have missed changes made on other devices. A `@capacitor/app` `appStateChange` listener on the client Dashboard (scoped: `isActive === true`) can fire a lightweight background refetch/invalidate for the tiles, without wiping anything. `@capacitor/app` is already installed, so no new plugin is needed for this piece.

These two mechanisms are complementary and independent. Both are worth adding; both leave `CacheBuster` untouched.

### 6. Version-mismatch guard — covered above (§4)

Explicit `SNAPSHOT_VERSION` constant + shape validation on read + max-age + per-user + per-local-date keying. Guard failures fall back silently to the current skeleton/fetch path, so the worst case is "same behavior as today."

---

## Go / No-Go

**GO** on the native-snapshot approach.

- Native `UserDefaults` (via `@capacitor/preferences`) survives `CacheBuster` — confirmed by reading the Swift source directly.
- Auth restore is completely decoupled: session lives in webview `localStorage` (also not in CacheBuster's clear list), snapshot lives in native `UserDefaults`, different storage, different keys, different clients. No login-loss risk.
- One new dependency: `@capacitor/preferences` (first-party, additive, would require a `pod install` / `npx cap sync` on the user's local machine after export — no changes to existing native plugins).
- `@capacitor/app` resume listener is a separate, additive win for the warm-resume case.

## Proposed next-phase scope (not applied now)

When you approve, a single implementation prompt would:

1. Add `@capacitor/preferences`.
2. Add a small `dashboardSnapshot.ts` helper (read/write/validate with `SNAPSHOT_VERSION`, per-user, per-local-date key, max-age).
3. Wire the four client dashboard cards (MacroSummary, TodayActions, ProgressMomentum, ProgressWidgetGrid) to hydrate initial state from the snapshot when present, then let their existing `useDataFetch` refresh in the background and rewrite the snapshot on success.
4. Add a scoped `App.addListener('appStateChange', …)` on the client Dashboard to trigger a lightweight refetch on warm resume.
5. Leave `CacheBuster`, `useDataFetch`, `useHealthSync`, Auth, RLS, indexes, schema, coach-side code, `getDisplayPosition()`, `calendar_events` rules, and en-CA formatting fully untouched.
