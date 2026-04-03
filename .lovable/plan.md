
Goal: remove the unreliable rest-timer sound completely and replace it with cues that are much more dependable on iPhone/Android PWAs.

What I found
- The active workout flow uses sound in `src/components/workout/InlineRestTimer.tsx` and `src/components/workout/FloatingRestTimer.tsx`.
- `src/components/WorkoutLogger.tsx` still primes audio when a workout starts and again before opening a rest timer.
- There is also a legacy `src/components/RestTimer.tsx` path that still calls `playCountdown`, `stopCountdown`, and keep-alive methods.
- The sound service is centralized in `src/services/RestTimerAudioService.ts`, with tests tied to that behavior.

Implementation plan
1. Remove rest-timer sound from the live workout flow
- Delete `restTimerAudio` calls from `InlineRestTimer`, `FloatingRestTimer`, and `WorkoutLogger`.
- Remove the legacy countdown/keepalive sound path from `RestTimer` so there is no hidden audio behavior left.
- Keep the timer worker and completion timing exactly as-is.

2. Replace sound with cues that are reliable
- Add haptic vibration on completion using the existing browser-safe pattern already used elsewhere in the app (`navigator.vibrate(...)` when supported).
- Strengthen the visual completion state:
  - clearer “Rest complete” / “Ready for next set” message
  - stronger color change/border glow
  - checkmark/pulse state when the timer hits zero
- Preserve skip behavior and auto-complete flow.

3. Recommended alternatives that will work better than sound
- Best default: haptic vibration + stronger visual “Rest complete” state
- Optional upgrade: brief full-width banner/toast saying “Rest complete — next set ready”
- Optional upgrade: highlight the next log button / next set row when the timer ends
- Optional upgrade: small screen flash or gold pulse on the timer card
These are much more reliable than audio in mobile webviews.

4. Clean up regressions
- Update tests that currently expect audio playback so they instead verify completion behavior and non-audio cues.
- Remove any now-unused imports and dead audio references from the workout flow.
- Leave the native audio plugin files alone unless you want a deeper cleanup pass; removing the live usage is the safer production fix.

Validation plan
- Test workout logging flow end-to-end on the client workout screen
- Confirm: log set → rest timer starts → timer ends → no sound plays → visual completion appears clearly
- Confirm skip still dismisses correctly
- Confirm background/return during a rest timer still ends cleanly
- Confirm there are no remaining workout-flow calls to `restTimerAudio`

Recommended outcome
- Ship the timer with no sound
- Use haptic + visual completion as the default cue set
- If you want, after this fix I can do a second pass to make the “rest complete” cue feel more premium, closer to Strong/Trainerize
