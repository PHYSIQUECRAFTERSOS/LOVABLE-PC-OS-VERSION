# Stabilize daily loading and reduce app resource usage

## Goal
Remove the confirmed causes of intermittent blank screens, endless loading, and repeated backend traffic while preserving every existing workflow and all stored data.

## Confirmed findings
- The backend is healthy with low connection pressure and moderate memory use; current evidence points to frontend request orchestration and query shape rather than undersized compute.
- A single calendar change can trigger several staggered Today’s Actions refetches plus adjacent-day prefetches.
- Messaging still loads complete thread histories and reactions without pagination, and the coach inbox refetches for unscoped message inserts.
- Several important screens use all-or-nothing `Promise.all` blocks or omit `finally`, allowing one failed secondary query to blank a screen or leave a permanent spinner.
- `useDataFetch` and nested retry wrappers can own conflicting timeout budgets, leaving retries running after the visible request has timed out.
- Program Builder registers a visibility listener with a different cleanup callback, accumulating autosave listeners across mounts.
- Service-worker activation can hard-reload an active workout, form, or editor as soon as a deployment is detected.
- Some partial lookup failures are converted into confirmed incomplete/empty data and then cached.

## Implementation
1. **Fix shared request lifecycle**
   - Make retries cooperate with caller cancellation and use one bounded timeout budget.
   - Ensure stale verified data remains visible during refresh failures.
   - Keep error and true-empty states distinct by default on critical data screens.

2. **Stop request amplification**
   - Replace Today’s Actions’ triple delayed refresh with one debounced invalidation/refetch.
   - Scope or locally guard remaining high-traffic realtime subscriptions and debounce roster/check-in refreshes.
   - Prevent global cache invalidations from immediately launching duplicate requests for the same key.

3. **Harden loading states**
   - Convert TDEE, check-in dashboard, onboarding, and progress workspace loads to independently settled requests.
   - Add `try/catch/finally` cleanup and retain useful partial data when secondary sources fail.
   - Never save a failed nutrition/cardio/session lookup as a confirmed dashboard completion state.

4. **Reduce messaging and roster traffic**
   - Load only the newest message page initially and add cursor-based history loading.
   - Fetch reactions only for loaded message IDs.
   - Bound all-time weight/check-in reads used only for latest-value cards and narrow broad profile selects to rendered columns.
   - Preserve existing inbox search, unread badges, realtime delivery, attachments, and optimistic sending.

5. **Protect active user work**
   - Correct Program Builder visibility-listener cleanup.
   - Defer service-worker reloads while a workout, upload, form, or editor has unsaved/in-progress work; apply the update at a safe navigation point.

## Technical constraints
- No destructive schema changes, table drops, or policy replacements.
- No new backend function or secret is expected.
- Existing role/RLS behavior, local-date handling, optimistic mutations, snapshots, and coach authority remain unchanged.
- Additive indexes or a small read-only aggregation function will be considered only if post-fix query measurements still prove a database bottleneck.

## Validation
- Add focused tests for retry cancellation, stale-data retention, partial failures, listener cleanup, and deferred updates.
- Simulate failed/slow calendar, nutrition, workout, check-in, and message requests and confirm every loader resolves to data or Retry within the bounded budget.
- Verify message pagination, send/read/unread behavior, attachments, and realtime updates without duplicate requests.
- Verify workouts resume and complete, nutrition logs and meal plans render, calendar day changes work, and coach client pages retain partial data during one-source failures.
- Run authenticated desktop and 375px mobile cold-load, warm-resume, and repeated-tab tests across Dashboard, Calendar, Training, Nutrition, Messages, and Clients.
- Compare before/after request counts and timings; require no false empty states, stuck spinners, duplicate writes, unexpected reloads, or uncaught console errors.
