## Goal

1. Voice notes recorded on desktop must play everywhere (iPhone included) with **no "Error"** label and **no red error toast**.
2. Replace the ugly native `<audio>` controls in chat with a custom gold-accent **waveform player** — visually appealing, dopamine-inducing.

No Xcode rebuild needed — all changes are JS/CSS.

---

## Part 1 — Reliable cross-platform encoding (kills the "Error")

Root cause: desktop Chrome records `audio/webm;opus`, which iOS Safari/WKWebView cannot decode → iOS shows "Error". The current ffmpeg.wasm fallback fails to load over the CDN, so we fall back to raw webm and iOS chokes.

Replace `src/lib/audioTranscode.ts` with a **WAV encoder** using only Web Audio API (no wasm, no CDN, ~100% reliable):

- Decode the recorded blob via `AudioContext.decodeAudioData`
- Downmix to mono, resample to 16 kHz (voice-grade)
- Encode 16-bit PCM WAV (RIFF header)
- Return `audio/wav` blob (~2 MB per 2-min note — well within size limits)

WAV is natively supported by Safari, iOS WKWebView, Chrome, Firefox, Android. Zero compatibility risk.

Update `src/components/messaging/VoiceMessageRecorder.tsx`:
- iOS-native recordings (mp4/m4a/aac) still uploaded as-is (already plays everywhere)
- All other browsers → run new `encodeToWav()` → upload as `.wav` / `audio/wav`
- **Remove the red "Voice note may not play on iPhone" toast** — never falls back to raw webm anymore
- If WAV encode somehow fails, show a clear error and let the user retry instead of silently uploading a broken file

## Part 2 — Custom gold waveform player

Replace the native `<audio controls>` in `src/components/messaging/MessageAttachment.tsx` (audio branch) with a new component `src/components/messaging/VoiceNotePlayer.tsx`.

Visual:
```
[▶]  ▁▃▆█▇▅▃▂▁▂▄▆▇█▆▄▂▁▂▃▅▇▆▄▂   0:14
```
- Circular gold (`#D4A017`) play/pause button (40×40), `Play`/`Pause` lucide icons, subtle scale on press
- **Real waveform peaks**: on mount, fetch the audio once, decode via Web Audio, downsample to ~48 peak bars, cache peaks in a `WeakMap` keyed by URL so each note decodes once
- Bars: 3px wide, 2px gap, rounded; played portion = solid gold, unplayed = `gold/25` (muted)
- Animated fill: as `audio.currentTime` advances, bars to the left of the playhead flip to filled gold via a smooth CSS transition
- Click/tap any bar to seek
- Duration label on the right (gold/70), switches to elapsed time while playing
- Loading shimmer (gold) while peaks decode; if decoding fails, fall back to flat bars (still plays fine, just no real shape)
- Skeleton width while loading matches final width so layout doesn't jump
- Compact: `min-w-[220px] max-w-[300px]`, fits both sent (gold bubble) and received (dark bubble) sides — bars use `currentColor` so the contrast auto-adapts

Keep a hidden `<audio>` element under the hood for actual playback (cleanest browser support, no MediaSource gymnastics).

## Part 3 — Cleanup

- Remove `@ffmpeg/ffmpeg` dynamic import path; the package can be uninstalled in a follow-up but leaving it doesn't break anything (no longer referenced)
- No DB changes, no edge functions, no Capacitor changes, no iOS plugin changes

## Verification checklist

1. Desktop browser → record + send voice note → no red toast, file uploads as `.wav`
2. Open same thread on iPhone (PWA + native app) → waveform renders, taps play, audio plays — **no "Error"** label
3. iPhone → record + send → still uses native m4a path, plays on desktop
4. Old webm notes already in DB still render in the new player (they'll just play via native fallback or show flat bars) — no crash
5. Played progress visually fills bars in real time; tap-to-seek works
6. Both sent (gold bubble) and received (dark bubble) sides look clean

## Files touched

- `src/lib/audioTranscode.ts` — rewrite as WAV encoder
- `src/components/messaging/VoiceMessageRecorder.tsx` — swap mp3 path for wav, drop red toast
- `src/components/messaging/MessageAttachment.tsx` — audio branch renders new player
- `src/components/messaging/VoiceNotePlayer.tsx` — **new** waveform player component
