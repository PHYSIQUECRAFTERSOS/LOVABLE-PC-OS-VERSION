

# Fix Rest Timer Sound + Add Lock Screen Countdown

## Problems
1. **Sound is silent on iOS**: The current `AudioContext` oscillator approach gets suspended by iOS when the browser is backgrounded or the phone is locked. iOS requires a user-gesture-unlocked audio element, not raw oscillators created at timer-completion time.
2. **No lock screen countdown**: The timer is only visible inside the app. The user wants the countdown visible on the iPhone lock screen, like the Strong app.

## Solution

### 1. Reliable Sound via `<audio>` element
- Create a utility module `src/utils/restTimerAudio.ts` that:
  - Pre-creates a hidden `<audio>` element on first user interaction (set completion tap / workout start)
  - Loads a short MP3 alarm tone (a base64-encoded ~1s chime embedded directly in code, no external file needed)
  - On timer complete, calls `.play()` on this pre-unlocked audio element
  - This works on iOS even when backgrounded because the audio session is already active

### 2. Lock Screen Timer via Media Session API
- When a rest timer starts, play a **silent audio track** of the exact rest duration using the same `<audio>` element
- Set `navigator.mediaSession.metadata` with title "Rest Timer" and the workout name
- Set `navigator.mediaSession.setPositionState()` with duration = rest seconds, position = 0, playbackRate = 1
- iOS will show a "Now Playing" widget on the lock screen with the countdown progress
- When timer completes, swap the silent track for the alarm chime
- On skip, stop the silent track and clear media session

### 3. Apply to both timer components
- Update `InlineRestTimer.tsx` and `FloatingRestTimer.tsx` to use the new audio utility instead of raw `AudioContext`
- Remove duplicated `playSound` logic from both components

## Files to create/edit
1. **Create** `src/utils/restTimerAudio.ts` — audio utility with silent track generation, alarm sound, and Media Session integration
2. **Edit** `src/components/workout/InlineRestTimer.tsx` — replace `playSound` with new utility, call `startMediaSession()` on mount and `stopMediaSession()` on skip/complete
3. **Edit** `src/components/workout/FloatingRestTimer.tsx` — same changes

## Technical detail: Silent track generation
Generate a silent WAV in-memory using a small ArrayBuffer (no external file needed). The duration matches the rest timer seconds. This is what drives the lock screen countdown via Media Session.

