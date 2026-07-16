## Diagnosis

The rest-timer "ding" is silent on Android because the audio path is hard-coded to an **iOS-only** native plugin.

**Flow today** (`src/utils/restTimerAudio.ts`):
- `isNative() === true` on both iOS and Android.
- Foreground: calls `AudioMixPlugin.playRestTimerCue()`.
- Background: schedules a `LocalNotifications` entry with sound `rest-timer-complete.caf`.

**Why it breaks on Android:**
1. `AudioMixPlugin` is defined only in `ios-plugin/AudioMixPlugin.swift` and registered only in `ios-plugin/MainViewController.swift`. There is no Kotlin counterpart in `android-plugin/`. On Android, `registerPlugin("AudioMixPlugin")` falls through to the web fallback, which throws `UNIMPLEMENTED`. The catch in `playRestTimerCue` retries once, fails again, and logs — no sound.
2. The HTMLAudioElement fallback (`/sounds/rest-timer-complete.mp3`) is only reached when `isNative() === false`, so Android never uses it even though the Capacitor WebView could play it fine.
3. The background `LocalNotifications` sound is `rest-timer-complete.caf` — a Core Audio Format file iOS-only. Android needs an `.mp3`/`.ogg` placed in `android/app/src/main/res/raw/` and referenced without extension. Result: no background ding either.

The client reports the foreground case ("when the timer hits zero"), so fixing the foreground path restores the ding immediately. Background is a smaller follow-up.

## Fix Plan

### 1. Split platform routing in `src/utils/restTimerAudio.ts`
- Add `isIOS()` and `isAndroid()` helpers using `Capacitor.getPlatform()`.
- **Preload:**
  - iOS: keep current `AudioMixPlugin.enableMixing()` + `preloadRestTimerCue()`.
  - Android + Web: build the `HTMLAudioElement` once with `preload = "auto"` and `load()`. (Same code that already exists in the web branch — just include Android in it.)
- **Play (`playCompletionSound`):**
  - iOS: unchanged (AudioMixPlugin path).
  - Android + Web: use the shared `HTMLAudioElement`, reset `currentTime = 0`, call `.play()`. This works in the Capacitor Android WebView because timer start is a user gesture and the audio element is created ahead of time (already the pattern in the knowledge snippet about Android async audio).

### 2. Background path on Android (`scheduleBackgroundCompletion`)
- iOS: unchanged, keep `rest-timer-complete.caf`.
- Android: pass sound as `"rest_timer_complete"` (no extension, lowercase + underscores per Android resource rules). Only include the `sound` field if the raw resource is present; otherwise fall back to the default notification sound so we still get an audible cue on lock screen.
- Document (in code comment) the one-time asset copy the user must do after `npx cap sync android`: place `rest-timer-complete.mp3` at `android/app/src/main/res/raw/rest_timer_complete.mp3`. If that file is missing, notification just uses the default system sound — still audible, no crash.

### 3. No changes to
- `InlineRestTimer.tsx` (call sites already correct).
- `ios-plugin/*` (iOS behavior preserved).
- `useAuth`, CacheBuster, service worker, localStorage — untouched per prior guardrails.

## Verification
- Web preview: confirm foreground ding via `playCompletionSound` in dev.
- Android: after next build, timer finish in foreground plays `/sounds/rest-timer-complete.mp3` through WebView. Background plays default system notification sound until the raw resource is added.
- iOS: regression-check that `AudioMixPlugin` path is untouched (same code, just guarded by `isIOS()` instead of `isNative()`).

## Files touched
- `src/utils/restTimerAudio.ts` — platform-split routing (only file with logic changes).