# HealthKit JS Sync Layer — Invariants

Any change touching `src/hooks/useHealthSync.ts`, `src/plugins/HealthKitPlugin.ts`,
or the Connected Devices / Health settings UI MUST preserve these five invariants.

Violations have caused multi-day outages before. They are now mechanically
checked where possible (see `assertLocalMidnightDateString` in
`src/lib/syncActivityLog.ts`) and observable via the hidden Sync Activity Log
(tap the app version 5× on the Connected Devices card).

---

## 1. Start-of-day query invariant

Day-bucketed HealthKit queries (`querySteps`, `queryActiveEnergy`,
`queryDistance`) MUST use **start-of-local-day** as their `startDate`,
formatted as `YYYY-MM-DD` via `getLocalDateString()` (en-CA).

**NEVER** use the sync interval window (e.g. "2 hours ago"), `new Date()`,
or `toISOString().split('T')[0]` (UTC) as the query start. Doing so causes
"today shows zero steps for half the day" — the March 2026 regression.

Mechanical check: `assertLocalMidnightDateString(date, "querySteps")` runs
before every day-bucketed query. Throws in dev, logs in prod.

## 2. Wait-for-bridge-ready invariant

`HealthKit.isAvailable()` and every other native call MUST NOT be invoked
before the Capacitor native bridge is ready. Concretely:

- Do not call from module top-level.
- Do not call inside a component's first render.
- Trigger only from: explicit user action, `appStateChange → isActive`,
  or a `setTimeout` after mount that gives the bridge time to initialize
  (current value: `INITIAL_SYNC_DELAY_MS = 3000`).

## 3. Non-fatal availability invariant

A failure or timeout of `isAvailable()` MUST degrade gracefully. It MUST
NOT render a hard blocking error that kills the Connected Devices screen
or prevents the user from reaching settings, the sync log, or other
integrations (Fitbit, Google Fit, manual entry).

## 4. allSettled invariant

Parallel metric queries use `Promise.allSettled` (NEVER `Promise.all`).
One failing metric MUST never fail the others. Current implementation runs
them sequentially with independent try/catch — equivalent guarantee. If
refactored to parallel, use `allSettled`.

## 5. Native-is-source-of-truth invariant

The native Swift plugin (`ios-plugin/HealthKitPlugin.swift`) is verified
correct. When sync breaks, JS adapts to it — do NOT "fix" sync by editing
Swift, entitlements, `Info.plist`, or the Xcode project as a first move.

Order of investigation:
1. Open the hidden Sync Activity Log on the affected device.
2. Read the **raw `detail`** of the first failing phase.
3. Fix in JS unless the log clearly indicates a native registration issue
   (e.g. "not implemented" — see BUILD.md triage procedure).
