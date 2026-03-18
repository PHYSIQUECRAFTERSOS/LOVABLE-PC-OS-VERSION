

# Plan: Fix Rest Timer to Not Interrupt Spotify/Apple Music

## Root Cause

The current `restTimerAudio.ts` plays a **silent WAV file via an `<audio>` HTML element** for the entire rest duration. On iOS, this takes exclusive control of the audio session and **pauses Spotify/Apple Music**. The Media Session API further hijacks the lock screen Now Playing widget.

## Solution

Remove the `<audio>` element and Media Session API entirely. Switch to **AudioContext only**, which mixes with other apps' audio instead of interrupting them. Use the uploaded 3-second countdown MP3 as the alarm sound.

## Changes

### 1. Copy uploaded sound to project
- Copy `Rest_Timer_3_Seconds.mp3` → `public/assets/sounds/rest-timer-countdown.mp3`

### 2. Rewrite `src/utils/restTimerAudio.ts`
- **Remove**: Silent WAV generation, `<audio>` element, Media Session API, `unlockAudio`, `startRestSession`, `updateRestPosition`, `stopRestSession`
- **Replace with**:
  - `initAudioContext()` — creates/resumes an AudioContext on first user gesture
  - `preloadCountdownSound()` — fetches and decodes the MP3 into an AudioBuffer on init
  - `playCountdownSound()` — plays the 3-second countdown MP3 via AudioContext (mixes with Spotify)
  - `stopCountdownSound()` — stops playback on skip

### 3. Update `InlineRestTimer.tsx`
- Remove calls to `startRestSession`, `updateRestPosition`, `stopRestSession`
- At **3 seconds remaining**, call `playCountdownSound()` (the MP3 is a 3-second countdown that naturally ends when the timer hits 0)
- On skip, call `stopCountdownSound()`
- Timer remains purely visual + JS interval (no audio session hijack)

### 4. Update `FloatingRestTimer.tsx`
- Same changes as InlineRestTimer

### 5. Update `RestTimer.tsx`
- Replace the old `playSound()` oscillator with `playCountdownSound()` at 3 seconds remaining

## Why This Works
- **AudioContext** plays sounds that **mix** with Spotify/Apple Music — it doesn't take over the audio session
- No `<audio>` element = no iOS audio session hijack
- No Media Session API = Spotify keeps its lock screen controls
- The 3-second countdown MP3 plays at exactly the right moment as a notification-style sound

## Trade-off
- No lock screen countdown widget (user agreed this is acceptable)
- Timer only works while the app is in the foreground (same as most workout apps)

