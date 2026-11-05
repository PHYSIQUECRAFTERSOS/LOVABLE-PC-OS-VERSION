# Longer voice notes, same quality

Voice notes currently stop at 2 minutes. Raise the limit to 5 minutes, keeping the same full-quality recording.

## What changes
- Recording limit goes from 2:00 to 5:00. The timer and auto-stop follow the new limit.
- Quality stays exactly as it is now (same full-quality setting, mic filters still off).
- A 5-minute note is roughly 5 MB, well within the upload limit.

## Technical details
- `src/components/messaging/VoiceMessageRecorder.tsx`: `MAX_DURATION` 120 -> 300. Bitrate (128 kbps) unchanged.
- Confirm the voice-message storage bucket's file size limit allows ~5 MB; raise it only if it is lower.
