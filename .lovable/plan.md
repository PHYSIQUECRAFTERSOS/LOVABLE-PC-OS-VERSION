## Goal
Make the workout rest timer behave like Strong: the sound plays only when the countdown reaches zero, never early, never randomly, and does not stop Spotify/Apple Music.

## What I found
- The uploaded MP3 is already the exact same file currently bundled as `public/sounds/rest-timer-complete.mp3`.
- The app already has the right native strategy in place: a lightweight `AudioMixPlugin` using iOS `AVAudioSession` with `.mixWithOthers`, not a third-party audio kit.
- The risky part is timer/event management: stale worker messages, app foreground/background transitions, and old scheduled notifications can cause early, late, or duplicate sounds.

## Recommended solution

### 1. Keep one sound path for each app state
- Foreground app: play the MP3 through the existing `AudioMixPlugin` on native, or `HTMLAudioElement` on web/PWA.
- Background/locked app: schedule a local notification only when the app actually goes into the background, for the exact timer end time.
- Cancel any pending background notification immediately when the app returns to foreground, when the timer is skipped, or when the workout/timer unmounts.

### 2. Add a stricter timer “run ID” guard
Update `InlineRestTimer.tsx` so every rest timer instance has a unique run ID.
- Worker `done` messages from an older timer are ignored.
- The sound can only fire if the active run ID matches.
- The sound can only fire when `Date.now()` is at or past the stored `endTime`.
- `hasPlayedRef` remains the final one-shot lock so the sound cannot double-play.

This directly targets the “plays at 30 seconds / 50 seconds” problem.

### 3. Tighten worker completion semantics
Update `timerWorker.ts` to send a single `done` event per timer run and stop itself immediately after completion.
- Keep wall-clock timing based on `endTime`, not decrementing state.
- Include the timer run ID in tick/done messages.
- Ignore any late message after stop/reset.

### 4. Harden audio preload/playback
Update `restTimerAudio.ts` to:
- Keep preload idempotent.
- Reuse the same audio object.
- Reset playback to `0` only at the actual zero event.
- Keep the native audio session mixing path intact so music continues playing.
- Avoid notification scheduling if the timer is already too close to zero or already completed.

### 5. Add regression tests
Update `inlineRestTimer.test.tsx` to verify:
- No sound/vibration on normal ticks like 30s or 50s remaining.
- Sound/vibration happens once on `done`.
- Duplicate `done` messages do not double-fire.
- Stale/old timer messages are ignored after a new timer starts.
- Skipping cancels the path and prevents later sound.

## Files affected
- `src/components/workout/InlineRestTimer.tsx`
- `src/services/timerWorker.ts`
- `src/utils/restTimerAudio.ts`
- `src/test/inlineRestTimer.test.tsx`

## What I will not change
- No database changes.
- No new edge functions.
- No new third-party audio kit.
- No rewrite of the workout logger.
- No new Xcode-native feature unless you later want background/lock-screen behavior improved beyond what local notifications can do.

## Important native note
For the native iOS app, avoiding Spotify interruption depends on the existing `AudioMixPlugin` already being included in the app target. I can avoid changing the Swift plugin, so you should not need a new native audio approach. But any previously released native app build that does not already include that plugin still cannot gain iOS audio-session behavior from web code alone; it would need the normal app update process.