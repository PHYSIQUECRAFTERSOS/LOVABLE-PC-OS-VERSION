# Make nutrition loading and cardio completion resilient

## Goal
Prevent a brief iOS/network interruption from making the Nutrition tracker look empty or hiding “Copy from meal plan,” and make cardio completion fast, retryable, and safe from duplicate side effects.

## Confirmed findings
- The hosted backend and database are currently healthy; recent database logs do not show statement timeouts or deadlocks. The reported `TypeError: Load failed` is consistent with a transient client/network failure rather than missing database records.
- Nutrition log loading currently makes one raw request. On a transient failure it keeps the component’s initial empty array, suppresses the error, and provides no loading/error/retry state, so existing foods appear to be gone.
- Meal-plan, day, and item queries discard request errors and return empty arrays. That makes “Copy from meal plan” disappear even though the plan still exists.
- The relevant nutrition, meal-plan, and calendar tables have row-level access rules and supporting indexes. No database permission or index change is currently indicated.
- Cardio completion performs one raw update with no timeout or retry, no returned-row verification, and no optimistic state. A stalled iOS fetch leaves the drawer pending; a transient failure surfaces the raw “Load failed” message.
- Nutrition and meal-plan database queries are completing in roughly tens of milliseconds when they reach the backend, so the fix should focus on request recovery and truthful UI state rather than larger infrastructure.

## Implementation
1. **Nutrition logs: preserve and recover**
   - Move the daily log request onto the shared bounded retry/timeout helper.
   - Track loading, refresh failure, and last verified data separately; never convert a failed request into a successful empty day.
   - Keep existing food rows visible during refresh failures and show an inline Retry state on a cold failure.
   - Cache the last verified per-user/per-date food log locally for instant iOS resume, and only replace it after a successful response.

2. **Meal-plan copy controls: never silently disappear**
   - Make active plans, plan days, and plan items throw on request errors and use bounded retries.
   - Expose their loading/error/refetch state from the meal-plan hook.
   - Keep the last verified plan visible while revalidating; on a cold failure show a compact “Meal plan unavailable — Retry” row instead of hiding all copy controls.
   - Ensure failed results are not cached as empty plans.

3. **Cardio completion: optimistic and idempotent**
   - Immediately mark the selected cardio action complete in local UI and close the drawer for instant feedback.
   - Run the calendar update through bounded transient retries, scoped to the signed-in client, and request the updated row back to verify persistence.
   - Make retries safe by setting the same completion values on the same event; award XP only after verified persistence.
   - On final failure, roll back the optimistic checkmark and show a friendly retry action instead of raw `TypeError: Load failed` text.
   - Invalidate the custom Today’s Actions cache and related dashboard queries once, removing redundant refetch waves from this completion path.

4. **Error messaging and observability**
   - Normalize transient connection failures into plain messages that reassure users their saved data has not been deleted.
   - Add focused development diagnostics for attempt count, duration, and final outcome without exposing data or creating noisy production logs.

## Validation
- Test Nutrition with populated logs, a genuine empty day, missing plan, and valid meal plan.
- Force the first nutrition-log and meal-plan requests to fail, then confirm retries restore all foods and copy controls.
- Force all attempts to fail and confirm cached data remains visible or a Retry state appears—never a false empty tracker.
- Complete cardio with first-attempt success, first-attempt network failure, delayed response, and final failure; confirm no stuck button, raw error, duplicate XP, or duplicate mutation.
- Verify Today’s Actions and completion ring update immediately and remain correct after reload.
- Run authenticated checks at desktop and 375px mobile widths, including a simulated iOS offline/resume cycle.

## Technical details
- Expected frontend files: `src/components/nutrition/DailyNutritionLog.tsx`, `src/hooks/useMealPlanTracker.ts`, `src/components/dashboard/CardioPopup.tsx`, `src/components/dashboard/TodayActions.tsx`, and a focused local snapshot/helper or existing snapshot extension.
- Add focused tests around retry classification, stale-data preservation, meal-plan error state, and cardio optimistic rollback/idempotency.
- No database migration, backend function, or secret is planned.
