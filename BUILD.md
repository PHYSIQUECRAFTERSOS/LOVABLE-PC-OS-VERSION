# BUILD & Operational Notes

## HealthKit durability — two layers

HealthKit sync is fragile because it crosses the JS/native boundary. Durability requires BOTH layers to hold:

### Layer 1 — Native durability

Run the **"HealthKit survive cap sync"** hardening (separate prompt / `scripts/post-cap-sync.sh`):
- After every `npx cap sync`, the HealthKit framework link and custom plugin target membership must self-heal.
- `preflight:archive` must pass before any archive is allowed.
- Custom Swift plugins (`ios-plugin/HealthKitPlugin.swift`, etc.) are restored automatically — never re-added by hand.

### Layer 2 — JS durability

The five invariants in [`HEALTH_SYNC_INVARIANTS.md`](./HEALTH_SYNC_INVARIANTS.md) MUST hold for any change to `src/hooks/useHealthSync.ts` or its callers.

Observability: the **hidden Sync Activity Log** is the first thing to check when a user reports a sync problem.
- How to open: on the Connected Devices card in Profile → Settings, tap the "Version X.X.X" footer line **5 times within 3 seconds**.
- Renders even if HealthKit is completely broken (does not call HealthKit on mount).
- Persists the last 100 sync events across app restarts (localStorage).

---

## Triage procedure when sync breaks

1. **Get the log from the affected device.** Open the hidden Sync Activity Log → **Copy All** → paste it into the ticket. Screenshots and Simulator runs are NOT acceptable substitutes.
2. **Read the raw `detail` of the FIRST failing phase.** That is the actual error. Do not guess from the user's red banner.
3. **Diagnose by phase:**
   - `isAvailable` → **failure / timeout** → JS bridge-ready issue (Invariant #2). Verify the call isn't running before bridge init; check the `INITIAL_SYNC_DELAY_MS` gate.
   - `isAvailable` → **`"not implemented"`** → native plugin registration issue. Run the native hardening + `preflight:archive`. Do NOT debug in JS.
   - `requestAuth` → **failure** with "authorization not determined" / "not authorized" → user has not granted HealthKit permission. Direct them to iOS Settings → Health → Physique Crafters.
   - `querySteps` / `queryActiveEnergy` / `queryDistance` → **failure mentioning dates or "invalid date"** → Invariant #1 violated. Inspect the start date passed to the plugin; it MUST be `YYYY-MM-DD` via `getLocalDateString()`. `assertLocalMidnightDateString` will already have thrown in dev.
   - `query*` → **timeout** → bridge is busy or another sync is running. Check the global sync lock; verify no concurrent hook instances.
   - `overall` → **skipped** → connection missing or global lock active. Not a bug.
4. **Fix in JS.** Editing Swift, entitlements, or the Xcode project is a LAST resort and only after step 3 clearly identifies a native registration problem (Invariant #5).
5. **Verify the fix on a real device** by re-opening the Sync Activity Log and triggering **Run Sync Now**. The new attempt must produce a `success` log entry live.

---

## Files

- `src/lib/syncActivityLog.ts` — ring-buffer log store + `assertLocalMidnightDateString`.
- `src/hooks/useHealthSync.ts` — all native calls are instrumented; header comment lists the five invariants.
- `src/pages/SyncLogDebug.tsx` — `/debug/sync-log` hidden screen.
- `src/components/settings/HealthIntegrations.tsx` — version footer + 5-tap trigger.
- `HEALTH_SYNC_INVARIANTS.md` — invariant contract.
