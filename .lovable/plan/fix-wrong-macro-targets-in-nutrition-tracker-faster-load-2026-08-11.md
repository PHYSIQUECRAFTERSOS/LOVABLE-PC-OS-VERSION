# Fix wrong macro targets in Nutrition Tracker + faster load

## What's happening

In the Nutrition Tracker, your macro targets are fetched on every open. Confirmed in the code:

- If that fetch fails (or the day-type lookup before it fails) — which is common on a cold app resume on mobile — the tracker silently falls back to hard-coded placeholder targets of 2000 cal / 150P / 200C / 70F, with no retry and no error shown.
- Those placeholders are far below your real targets, so your day instantly reads "way overboard" (the red `-2087 cal LEFT` bar). Restarting the app re-runs the fetch, it succeeds, and the numbers correct themselves — which matches exactly what you saw.
- There is no cached copy of your targets, so every cold boot starts from the placeholder and paints wrong numbers before real data lands.

The same pattern (no retry, placeholder-on-failure) also causes the dashboard to sit empty/slow on a cold start.

## The fix

1. **Never show fake targets.** Remove the silent placeholder fallback. If targets haven't resolved yet, the rings show a loading state instead of numbers that imply you're over.
2. **Retry transient failures.** Wrap the targets + day-type fetch in the existing retry helper (`withRetry`) so a dropped mobile request retries with back-off instead of dead-ending on placeholders.
3. **Cache your real targets locally.** Persist the last successfully loaded targets (per user + date) in the existing snapshot layer, so a cold boot paints your *actual* targets instantly and revalidates in the background.
4. **Surface real failures.** If retries still fail and there's no cached copy, show a small "Couldn't load your targets — tap to retry" line instead of silently guessing.
5. **Parallelize the tracker load.** Day type, targets, and logs currently run partly in sequence; run them together so the tracker paints faster on open.

## Technical notes

- `src/components/nutrition/DailyNutritionLog.tsx`: drop `DEFAULT_TARGETS` as an error fallback (keep it only as a typed shape), add a `targetsLoaded` flag gating the ring numbers, wrap `fetchTargets` in `withRetry` from `src/lib/resilientFetch.ts`, run `resolveDayType` and the `nutrition_targets` query concurrently.
- Reuse `readSnapshotSlice` / `writeSnapshotSlice` from `src/lib/dashboardSnapshot.ts` (add a `nutritionTargets` slice) for the cached targets.
- No database or business-logic changes; totals math, day-type resolution, and coach-set targets are untouched.
