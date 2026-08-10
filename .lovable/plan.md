# Make "Resume Workout" work first try, and keep the tracker open

## What's happening

Two separate failures show up in your screenshots:

1. **"Couldn't load workout — TypeError: Load failed"** — this is a network request that died mid-flight. On iOS, when the app sits in the background the webview suspends and can be reloaded from scratch by the OS. When you come back and tap Resume, the app fires a fresh request for the workout's exercises; if the connection hasn't fully woken up yet, that single request fails and there is no retry, so you get an error toast and no tracker. Force-quitting and tapping again works because by then the network is awake.

2. **"Couldn't load … canceling statement due to statement timeout"** — a database query took longer than the server allows and was cut off. Same visible result: an error toast instead of content.

3. **The tracker disappearing** — the workout tracker is rendered purely from memory. When iOS reloads the webview, that memory is gone, so the screen closes and you're back on the dashboard with only the "Unfinished Workout" banner.

## The fix

### 1. Retry instead of failing on the first dropped request
Wrap the workout-load path (exercise details + workout row) in a retry helper: up to 3 attempts with short back-off, and if the device reports offline, wait for the connection to come back before the next attempt. Transient failures (`Load failed`, aborted fetch, statement timeout) retry; real errors (permission, not found) fail fast with a clear message.

### 2. Resume opens instantly from a local snapshot
Persist the active workout payload (workout id/name, exercise plan, session id, and the sets already logged) to local storage while the workout is running, keyed by user + session. On Resume:
- Open the tracker **immediately** from the snapshot — no spinner, no network needed.
- Refresh from the server in the background and reconcile once it lands.

This is the same snapshot pattern already used for the dashboard cards.

### 3. Tracker survives a webview reload
On app start, if a live snapshot exists for an in-progress session (heartbeat within 2h), re-open the tracker automatically instead of dropping the user on the dashboard. The tracker stays up until the workout is finished or explicitly exited, so a background/foreground cycle no longer kicks you out mid-session.

### 4. Honest, recoverable errors
Replace the dead-end error toast with an inline "Tap to retry" state inside the tracker, so a failed load never leaves you with nothing to act on. Log the failing query key so future slowdowns are traceable.

### 5. Follow-up on the statement timeout
After this ships, I'll capture which query is being cancelled (the log line will name it) and index/tighten that one query separately. I have not yet confirmed which query is timing out, so I'm not changing the database in this pass.

## Technical notes

- New `src/lib/resilientFetch.ts`: `withRetry(fn, { attempts, backoff, waitForOnline })` classifying retryable vs terminal errors.
- `src/lib/workoutExerciseQueries.ts` → `fetchWorkoutExerciseDetails` called through `withRetry`.
- `src/hooks/useWorkoutLauncher.tsx` and `src/pages/Training.tsx` share one launch path: snapshot-first render, background revalidate, inline retry on failure.
- New `src/lib/workoutSnapshot.ts` (localStorage, keyed `pc:activeWorkout:<userId>`), written on set logging (debounced) and cleared on completion/exit.
- `src/hooks/useActiveSession.ts` gains snapshot awareness so the banner and auto-resume agree on state.
- No schema changes, no RLS changes, no changes to completion or heartbeat logic.
