## Diagnosis

The most recent update (`cc46887c "Added identity-expanded fetch"`) only touched `WorkoutLogger.tsx` and `workout/ExerciseCard.tsx`. Neither of those files is imported by the Calendar page, the client Dashboard tiles, the Training program list, or the Coach Command Center. So the code change itself did not break those screens.

What actually broke them is the accumulation of aggressive **5-second timeouts** landed across recent turns, combined with the harder cache-busting the service worker/CacheBuster now does on every launch. On mobile LTE (and desktop when a Supabase call is slow), 5s is not enough for the fan-out queries these screens run — the abort fires, and because the in-memory cache was just wiped on cold boot, the fallback (empty `[]`) renders as "Failed to load" / infinite spinner / empty priority card.

Concrete hotspots I found while auditing:

| Screen | File | Current timeout | Problem |
|---|---|---|---|
| Calendar (iOS: "Failed to load. Tap to retry.") | `src/pages/Calendar.tsx` line 85-92 | inherits `TIMEOUTS.STANDARD_API` = 5000ms | 5s not enough for the 5-way parallel fan-out (calendar + sessions + cardio + nutrition + weight + label chain). On abort with no prior cache it flips to `timedOut` → RetryBanner. |
| Training (spinner never resolves under the phase header) | `src/pages/Training.tsx` line 37 | hard-coded `timeout: 5000` | 5s abort on `get_client_training_workouts` RPC. ClientProgramView's own `useEffect` load has no error toast, so the child spinner stays on if the assignment step hiccups. |
| Dashboard Today's Actions ("0/1", missing workouts) | `src/components/dashboard/TodayActions.tsx` line 143-147 | inherits `TIMEOUTS.STANDARD_API` = 5000ms | 5s abort on 5-query fan-out means only the hard-coded "Track Nutrition" row survives — scheduled workouts silently drop out. |
| Coach Command Center | `src/components/dashboard/CoachCommandCenter.tsx` line 197 | already `30000` — OK | With 71 clients this is fine; screenshot actually shows it did load, just with zeros for yesterday. Verify by checking whether the "loading" state is what the user is seeing vs. real zero data. |
| Shared default | `src/lib/performance.ts` line 12 | `STANDARD_API = 5000` | Blanket 5s cap is the root cause across the app. |

The `useDataFetch` timeout path (line 139-146) writes the fallback and flips `timedOut=true` only when there is **no cached data**. Because CacheBuster wipes the WKWebView cache on every launch, cold boots always hit that branch on iOS. This is why the calendar renders skeleton → "Failed to load" on cold-start but works on second attempt.

## Plan

Read-only investigation is done. Fix in three surgical edits — no schema changes, no service worker changes, no touching of localStorage snapshots or CacheBuster scope (per your earlier constraints).

### Step 1 — Raise the shared API timeout to a mobile-realistic value

`src/lib/performance.ts`: change `STANDARD_API` from `5000` → `15000`. Keep `SPINNER_MAX` and `UPLOAD` alone. This is the single biggest lever — every screen that inherits the default (Calendar, TodayActions, ProgressWidgetGrid, MacroSummary, ProgressMomentum) instantly gets breathing room without per-file edits.

### Step 2 — Remove the two remaining hard-coded 5s caps

- `src/pages/Training.tsx` line 37: drop the `timeout: 5000` line so it inherits the new default.
- Grep for any other explicit `timeout: 5000` and remove (leave AI/upload alone).

### Step 3 — Make the Calendar page degrade gracefully instead of showing "Failed to load"

`src/pages/Calendar.tsx`: when `timedOut` fires but the primary `calendar_events` query actually returned rows, render the calendar with whatever partial data came back instead of the retry banner. The fan-out already uses `Promise.allSettled` — we just need to stop treating a slow sibling as a full failure. Guard the retry banner so it only shows when `events.length === 0`.

### Optional Step 4 — Diagnostic logging (kept out of production noise)

Add a one-line `console.warn` in `useDataFetch` when a timeout fires, tagged with the queryKey. You already have `logPerf` — surface aborts to console at warn level so future regressions like this show up in the console-logs tool without needing a device.

### Files that will NOT change

- `public/sw.js`, `src/main.tsx` (service worker / build-ID logic)
- `src/plugins/CacheBusterPlugin.ts`, iOS `CacheBusterPlugin.swift`
- `src/lib/dashboardSnapshot.ts` (localStorage snapshot layer)
- `src/components/WorkoutLogger.tsx`, `src/components/workout/ExerciseCard.tsx` (last turn's changes — unrelated to this bug)

### Verification

After the edits I'll:
1. Grep for any remaining `timeout: 5000` in the client tree.
2. Confirm `useDataFetch`'s timeout branch still writes the fallback so cached data (once we have it) survives.
3. Report back — you reload the app on iOS to confirm Calendar loads and Friday's Actions shows your scheduled workouts.

If after Step 1-3 the Command Center still looks empty in the preview, the "zeros" you're seeing are real data (no completed/missed workouts yesterday, no new clients last 7 days) — not a load failure. I'll confirm that separately with a Playwright pass against `/dashboard`.
