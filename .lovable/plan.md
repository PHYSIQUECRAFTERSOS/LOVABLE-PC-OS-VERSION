## Root cause

Foreground playback currently goes through `@capacitor-community/native-audio`. That plugin's iOS implementation calls `AVAudioSession.setCategory(...)` itself during `preload`/`play` and does **not** pass `.mixWithOthers`. Our `AudioMixPlugin.enableMixing()` sets the right category on app load, but NativeAudio silently overrides it the moment the cue plays — which is exactly why Spotify pauses and stays paused even though the app is in the foreground.

Calling `enableMixing()` immediately before `NativeAudio.play()` (which we already do) does not help, because NativeAudio re-asserts its own category inside the play call itself.

## Fix strategy

Stop using `@capacitor-community/native-audio` for the rest-timer cue. Play the bundled MP3 directly from our own Swift plugin, where we fully control `AVAudioSession` and the player instance. This is the only way to guarantee `.mixWithOthers` is in effect at the exact moment the sound is decoded and routed.

Background (locked / app suspended) path is unchanged: the scheduled `LocalNotification` still fires its bundled sound. Per your answer, a brief Spotify interruption in that case is acceptable since you need the cue.

## Changes

### 1. `ios-plugin/AudioMixPlugin.swift` — extend with a player
- Keep `enableMixing()`.
- Add `playRestTimerCue()`:
  - Re-assert `.playback + .mixWithOthers` and `setActive(true)`.
  - Lazily load `rest-timer-complete.mp3` from the app bundle into a retained `AVAudioPlayer`.
  - `player.numberOfLoops = 0`, `player.volume = 1.0`, `player.prepareToPlay()` on first load, then `player.play()`.
  - Do **not** call `setActive(false)` after playback — leaving the session active with `.mixWithOthers` lets Spotify keep streaming.
- Add `preloadRestTimerCue()` for warm-up on mount.

### 2. `src/plugins/AudioMixPlugin.ts`
- Add `preloadRestTimerCue()` and `playRestTimerCue()` to the interface.

### 3. `src/utils/restTimerAudio.ts`
- Remove all `@capacitor-community/native-audio` usage from the foreground path.
- `preloadRestTimerAudio()` on native → `AudioMixPlugin.enableMixing()` + `AudioMixPlugin.preloadRestTimerCue()`.
- `playCompletionSound()` on native → `AudioMixPlugin.enableMixing()` then `AudioMixPlugin.playRestTimerCue()`.
- Web path (HTMLAudioElement) is unchanged.
- Background `scheduleBackgroundCompletion` / `cancelBackgroundCompletion` are unchanged — still uses `LocalNotifications` with the bundled `rest-timer-complete.mp3`.

### 4. `package.json`
- Remove `@capacitor-community/native-audio` (no other callers — verified by search; the only references are in `restTimerAudio.ts`).

### 5. Asset wiring
- Bundle root already includes the mp3 for the notification sound. `AudioMixPlugin.swift` will read it via `Bundle.main.url(forResource: "rest-timer-complete", withExtension: "mp3")`. `post-cap-sync.sh` already restores our custom Swift plugins.

## Acceptance criteria
1. Spotify playing → start workout → log set → countdown runs → cue plays at 0 → Spotify keeps playing uninterrupted. ✅ primary goal.
2. App backgrounded mid-timer → cue still fires from `LocalNotification` (brief Spotify duck/pause acceptable per your confirmation).
3. Skipping a set or unmounting the timer cancels any pending notification — no ghost banners.
4. No regression to other audio (rank-up, push notifications).

## Post-implementation step required
After approval, you'll need to run `npx cap sync` and rebuild in Xcode because `AudioMixPlugin.swift` and `package.json` change.
