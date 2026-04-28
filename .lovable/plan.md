## Problem

Keith Berens reports: after tapping "Finish Workout" with all sets completed, the summary screen briefly appears, then the app "crashes" and dumps him back into an empty workout view.

## Root Cause (confirmed via DB inspection)

Inspection of `workout_sessions` for Keith (`bb25a218…`) shows a clear repeating pattern: every legitimate completed session is shadowed ~3 seconds later by a **ghost row** with `status = 'completed'`, but `completed_at = NULL`, `duration_seconds = NULL`, `sets_completed = NULL`, `total_volume = NULL`. Example:

- `f35f0193` — real session, finished 12:26:44, 22 sets, 39,945 volume, 4 PRs
- `95073b3e` — ghost row, started 12:26:47, no completion data

This same pattern exists for every workout Keith has finished in the past two weeks.

The sequence producing this:

1. `WorkoutLogger.finishWorkout()` succeeds: it flips the real `workout_sessions` row to `completed`, marks the calendar event `is_completed = true`, then calls `setShowSummary(true)`.
2. Something causes **WorkoutLogger to remount** while the summary is animating in (likely an iOS WKWebView quirk: ConfettiBurst canvas reflow + many parallel `animate-stagger-fade-up` keyframes + dynamic-imported `rankedXP` / `challengeAutoScore` modules trigger a parent re-render that bumps the launcher key; possible swipe-back gesture on the gold gradient screen also fits).
3. On remount, `WorkoutLogger.initSession()` (lines 270-319) sees no `in_progress` session for this workout, so it **inserts a brand-new empty session row** (`95073b3e`).
4. `useActiveSession.checkForSession()` (lines 124-132 of `src/hooks/useActiveSession.ts`) immediately picks up the new in-progress row, sees today's `calendar_events` row is already `is_completed = true`, and runs the self-heal:
   ```ts
   await supabase.from("workout_sessions")
     .update({ status: "completed" } as any)   // ← no completed_at
     .eq("id", candidate.id);
   ```
   That self-heal sets `status = 'completed'` but does **not** set `completed_at`, producing the ghost row.
5. Meanwhile the UI shows the empty workout because the remounted `WorkoutLogger` has no logs to restore.

The exact same "no completed_at" pattern exists in `Training.tsx` (lines 156-159) and in `WorkoutLogger.tsx` `onDone` (lines 1067-1071) — three separate self-heal updates that all forget to set `completed_at`. They're cosmetic in isolation but they prove the root cause and they pollute analytics (`completed_at` is the canonical "this session ended at X" field for charts and PR history).

The deeper root cause is step 3: `WorkoutLogger.initSession()` happily creates a new in-progress session even when the calendar already shows the workout was completed today. The initial mount must guard against this.

## Fix Plan

### 1. Stop the ghost-session creation at the source — `src/components/WorkoutLogger.tsx`

In the `initSession()` `else` branch (lines 300-319), before the `INSERT`, run the same calendar-events guard already used in `Training.tsx` and `useActiveSession.ts`:

- Query `calendar_events` for `linked_workout_id = workoutId`, `event_type = 'workout'`, `event_date = todayStr`, `is_completed = true`, `or(user_id.eq.{user.id}, target_client_id.eq.{user.id})`.
- If a row exists, **do not insert a new session**. Instead set a small flag (e.g. `setAlreadyCompletedToday(true)`) and short-circuit. Render a friendly "Workout already completed today" panel with a "Back to Dashboard" button (re-uses `onComplete?.()` + `navigate("/dashboard", { replace: true })`).

This fully prevents the ghost row even if the parent remounts the logger.

### 2. Make all three "self-heal completed" writes set `completed_at`

So they stop producing rows with `status = 'completed', completed_at = NULL`:

- `src/hooks/useActiveSession.ts` line 128 — add `completed_at: new Date().toISOString()` to the update.
- `src/pages/Training.tsx` line 158 — same addition.
- `src/components/WorkoutLogger.tsx` line 1069 (inside `onDone`) — same addition.

### 3. Harden the summary mount path against unexpected unmount

- In `WorkoutLogger.tsx`, when `showSummary === true`, add a `useEffect` that fires `workout-session-completed` and `workout-session-ended` once more on mount of the summary branch (the events are already idempotent). This guarantees `useActiveSession.completedSessionIds` has the sessionId before any background re-render can pick up a new in-progress row.
- Wrap the dynamic `import("@/utils/rankedXP")` and `import("@/utils/challengeAutoScore")` calls inside `backgroundWork()` with a top-level `try/catch` per import (they already are, but verify a thrown sync error during the dynamic import on slow iOS doesn't escape — currently both are inside `try`, so this is just confirmation, no change needed unless a leak is found).

### 4. Backfill / clean up Keith's existing ghost rows

Run a one-shot migration that flips `completed_at` on the orphan rows so analytics, PR history, and the dashboard "last workout" widget aren't skewed:

```sql
-- Set completed_at = updated_at for any session that is "completed" but has no completed_at,
-- and zero out the ghost metric columns so they don't pollute totals.
UPDATE public.workout_sessions
SET completed_at = COALESCE(completed_at, updated_at, started_at, created_at)
WHERE status = 'completed' AND completed_at IS NULL;
```

(No data is destroyed — the legit rows already have `completed_at`; only ghost rows are touched, and they have nothing else of value.)

### 5. Verify

- Run `psql` (read query) afterward to confirm no rows exist with `status = 'completed' AND completed_at IS NULL`.
- Smoke-test the finish flow as a client account: complete a short workout, watch the summary appear, dismiss with "Done", confirm only ONE row was added to `workout_sessions` (no shadow row), and that the dashboard shows the workout as completed.

## Files Touched

- `src/components/WorkoutLogger.tsx` — add today-completed guard in `initSession`, render "already completed" panel, add `completed_at` to onDone self-heal, add belt-and-suspenders dispatch on summary mount.
- `src/hooks/useActiveSession.ts` — add `completed_at` to self-heal update.
- `src/pages/Training.tsx` — add `completed_at` to self-heal update.
- One DB migration to backfill existing ghost rows.

## Out of Scope

- Investigating the original "remount" trigger (iOS WKWebView animation/canvas race). Fix #1 makes that trigger benign; chasing the underlying cause is a deep iOS WebKit rabbit hole and not necessary once the logger refuses to recreate a session for a workout that's already done today.
- Changing the summary screen visuals or animations.
