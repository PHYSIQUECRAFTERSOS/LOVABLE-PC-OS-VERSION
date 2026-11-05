# Clearer voice messages

## What's making them muddy
1. **Audio gets cut to phone-call quality before sending.** On desktop and Android, every voice note is converted down to 16 kHz, the same quality as an old phone call. That removes the crispness a podcast mic captures.
2. **The browser "cleans up" the mic.** Recording uses the browser's default settings: echo cancellation, noise suppression and automatic volume. With a good mic, these squash and warble your voice.
3. **No quality is requested from the recorder**, so it uses its lowest default.

## Changes
- Record with echo cancellation, noise suppression and auto volume **off**, and ask for full quality (48 kHz, mono).
- Ask the recorder for a high bitrate (128 kbps).
- Convert voice notes at **44.1 kHz** instead of 16 kHz. They still play on every phone, including iPhones.
- iPhone app recordings (already sent as m4a) stay as they are.

## Trade-off
Voice note files get about 2.75x bigger (a 2-minute note goes from about 4 MB to about 10 MB). Uploads take a little longer on slow connections. Sending and playback otherwise work the same.

## Technical details
- `VoiceMessageRecorder.tsx`: `getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1, sampleRate:48000 } })`, falling back to `{audio:true}` if that's rejected; `new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })`.
- `audioTranscode.ts`: `TARGET_SAMPLE_RATE = 44100`; update the header comment.
- Check the storage upload size limit for the voice bucket still allows the larger files.
- Verify: record a test note in the preview and confirm it uploads and plays.
