

# Plan: Fix Rest Timer Audio on iOS Native App

## Root Cause

On iOS, the `AudioContext` gets **suspended by the OS** during the ~60-180 second rest period between when the user taps "Log" (which calls `unlock()`) and when the 3-second countdown fires. The `playCountdown()` method tries `ctx.resume()`, but iOS blocks `resume()` calls that happen outside a user gesture. The Web Worker's `onmessage` callback is not a user gesture — so the resume silently fails and no sound plays.

This is the same reason Strong and other fitness apps use a native audio session approach: iOS requires the audio session to be kept alive.

## The Fix

**Add a keepalive mechanism to `RestTimerAudioService`** that plays a tiny silent buffer every 5 seconds while a rest timer is active. This prevents iOS from suspending the AudioContext during the rest period. The silent buffer is inaudible (1 sample of silence) and does not interfere with Spotify/Apple Music.

### File: `src/services/RestTimerAudioService.ts`

1. **Add `startKeepAlive()` method** — starts an interval that plays a 1-sample silent buffer every 5 seconds through the AudioContext. This keeps iOS from reclaiming the audio session.

2. **Add `stopKeepAlive()` method** — clears the keepalive interval when the timer completes or is skipped.

3. **Configure AudioContext for mixing** — when creating the AudioContext, check for the `webkitAudioContext` option to set the audio category to ambient/mixing mode so it overlays on top of Spotify/Apple Music instead of pausing it.

### File: `src/components/workout/InlineRestTimer.tsx`

4. **Call `startKeepAlive()` when the timer starts** — right after `worker.postMessage({ type: "start" })`.

5. **Call `stopKeepAlive()` in all exit paths** — timer complete, skip, and cleanup.

### File: `src/components/workout/FloatingRestTimer.tsx`

6. Same keepalive start/stop pattern as InlineRestTimer.

### File: `src/components/RestTimer.tsx`

7. Same keepalive start/stop pattern.

## Technical Detail

```text
User taps "Log"
  → unlock() resumes AudioContext + plays silent buffer ✓
  → startKeepAlive() begins 5s silent-buffer loop
  
Every 5s during rest:
  → silent buffer plays, keeping AudioContext "running" state
  
Timer hits 3s remaining:
  → playCountdown() fires — AudioContext is already running ✓
  → Countdown audio mixes with Spotify/Apple Music
  
Timer completes or skipped:
  → stopKeepAlive() clears interval
```

## Files to modify
- `src/services/RestTimerAudioService.ts` — add keepalive + audio mixing config
- `src/components/workout/InlineRestTimer.tsx` — wire keepalive start/stop
- `src/components/workout/FloatingRestTimer.tsx` — wire keepalive start/stop
- `src/components/RestTimer.tsx` — wire keepalive start/stop

