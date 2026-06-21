## Problem

When a coach records a voice note on **desktop Chrome**, the recorder saves it as `audio/webm;codecs=opus`. iOS Safari and the iOS WKWebView (your Capacitor app) cannot decode webm/opus, so the `<audio>` element shows "Error" and stays stuck at 0s. Recordings made on iOS already use `audio/mp4`, which is why phone-to-phone works but desktop-to-phone doesn't.

## Fix

Convert the recorded audio to **MP3** in the coach's browser before uploading, using `@ffmpeg/ffmpeg` (ffmpeg.wasm). MP3 plays natively on every device — iOS, Android, desktop. No edge function or backend changes.

The ffmpeg WASM bundle (~5MB) is loaded lazily the first time a user actually sends a voice note in a session, so it doesn't impact app startup or anyone who never sends voice notes.

### Files changed

1. **`src/components/messaging/VoiceMessageRecorder.tsx`**
   - Keep the existing MediaRecorder capture (webm on desktop, mp4 on iOS) unchanged.
   - In `sendVoiceMessage()`, before upload:
     - If blob is `audio/mp4` / `audio/m4a` → upload as-is (already iOS-compatible, no need to transcode).
     - Otherwise (webm/ogg/anything else) → run it through a new `transcodeToMp3()` helper, then upload the resulting MP3 blob as `voice-message.mp3` with `contentType: "audio/mpeg"`.
   - Show "Converting…" state during transcode (it takes 1–3s for a typical 30s clip).
   - If transcode fails, fall back to uploading the original blob and show a toast warning that iOS clients may not be able to play it.

2. **`src/lib/audioTranscode.ts`** (new)
   - Lazy-loaded singleton that calls `createFFmpeg({ corePath: "/ffmpeg/ffmpeg-core.js" })` once.
   - Exports `transcodeToMp3(blob: Blob): Promise<Blob>` that writes the input to the virtual FS, runs `-i input -vn -acodec libmp3lame -b:a 64k output.mp3`, and returns an `audio/mpeg` blob.
   - 64 kbps mono is plenty for voice and keeps files small.

3. **`public/ffmpeg/`** (new static assets)
   - Copy `ffmpeg-core.js`, `ffmpeg-core.wasm`, `ffmpeg-core.worker.js` from `@ffmpeg/core` into `public/ffmpeg/` so they're served same-origin (required — WASM streaming needs correct MIME type and avoids CORS issues with the unpkg CDN that ffmpeg.wasm defaults to).

4. **`package.json`**
   - `bun add @ffmpeg/ffmpeg@^0.11.6 @ffmpeg/core@^0.11.0` (the 0.11.x line works without SharedArrayBuffer / COOP-COEP headers, which we don't have configured; 0.12+ requires them).

### What stays the same

- `MessageAttachment.tsx` audio rendering — already correct for MP3.
- Recording UX (mic button, recording/preview states) — unchanged.
- Storage bucket, RLS, message insert flow — unchanged.
- iOS recordings — bypass transcoding entirely (they're already mp4/AAC, which iOS plays fine), so no perf cost on phones.

### Out of scope (per your answers)

- Old webm voice notes already in storage will keep showing "Error" on iOS. They're not migrated.
- No edge function, no server-side conversion.
- No changes to the rest timer / audio mixing work.

### Test plan

1. Coach on **desktop Chrome** records a 10s voice note → sends → check on iOS client app: plays correctly, duration shows, not "Error".
2. Coach on **iPhone Safari / app** records → sends → still plays everywhere (should be unchanged, no transcoding path hit).
3. Receive an existing pre-fix webm note on iOS → still shows "Error" (expected, not migrated).
4. Verify ffmpeg WASM only loads after the user first taps Send on a voice note (network tab).
