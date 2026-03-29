

# Fix Push Notifications + Rest Timer Alarm Sound

## Problem Analysis

### Push Notifications: Root Cause Found
The `push_tokens` table is **completely empty** — zero rows. This means no device token has ever been saved. Without tokens, the edge function has nothing to send to APNs.

The registration hook (`usePushNotifications`) relies on `canUsePush()` which checks for the Capacitor bridge. On a remote-URL Capacitor app (your TestFlight build), `Capacitor.isNativePlatform()` often returns `false`, and the fallback checks (webkit messageHandlers, user-agent sniffing) may also fail depending on the WKWebView configuration. The hook silently exits before ever calling `PushNotifications.register()`.

Even if registration does fire, the token upsert uses `as any` type casting, which masks potential schema mismatches — but the table schema and RLS look correct, so the real blocker is that registration never starts.

### Rest Timer Audio: Root Cause Found
The current logic triggers audio at **3 seconds remaining** (via `msg.remainingMs <= 3000`), not at zero. You want it **only at zero**. The existing sound file (`Rest_Timer_3_Seconds.mp3`) is a 3-second countdown clip — wrong for a completion alarm. The multiple attempts to fix this kept the same trigger-at-3s logic and the same file.

---

## Fix 1: Push Notifications

### Changes to `src/hooks/usePushNotifications.ts`

1. **Guarantee registration runs on native**: Remove the overly complex `canUsePush()` gating. On the Capacitor iOS build, always attempt registration inside a try/catch — if the plugin isn't available, it throws and we catch it. This is simpler and more reliable than bridge-sniffing.

2. **Add console logging at every step** so you can see in Xcode/Safari what's happening: permission request result, token value, upsert result.

3. **Remove `as any` cast** on the `push_tokens` table — it exists in the types. Use proper typed access.

4. **Add a retry mechanism**: If the initial registration attempt fails (common on cold app start), retry once after 2 seconds.

### Changes to `supabase/functions/send-push-notification/index.ts`

5. **Add detailed logging** so edge function logs show exactly what's happening: user_id received, tokens found, APNs response status/body.

6. **Use production APNs URL** — verify we're hitting `api.push.apple.com` not `api.sandbox.push.apple.com`. The current code uses production, which is correct for TestFlight and App Store builds.

### Verification Steps
- After deploy, open the app on TestFlight
- Check Xcode console for `[Push]` logs showing token received and saved
- Query `push_tokens` table to confirm token appears
- Send a test message from coach desktop → verify edge function logs show delivery
- Verify banner appears on lock screen / home screen

---

## Fix 2: Rest Timer Alarm Sound

### New Approach: Play sound at ZERO only

1. **Generate a new alarm tone** — a short (1-2 second), assertive "rest complete" chime/alarm using Web Audio API synthesis (two ascending tones). No external file dependency = no asset-loading failures. This eliminates the entire class of bugs where the MP3 fails to load, decode, or play.

2. **Simplify the timer components** (`InlineRestTimer.tsx`, `FloatingRestTimer.tsx`):
   - Remove all `triggerCountdown` / `countdownFiredRef` / `countdownPendingRef` logic
   - Remove keepalive start/stop (no longer needed for a completion-only sound)
   - On `msg.type === "done"`: call a simple `playCompletionAlarm()` method
   - The alarm is synthesized inline — no preloading, no asset fetching, no race conditions

3. **Update `RestTimerAudioService.ts`**:
   - Add `playCompletionAlarm()` method that synthesizes a short two-tone chime (e.g., 880Hz → 1320Hz, 150ms each) using AudioContext oscillators
   - On native: use the same oscillator approach (AudioContext works in Capacitor WKWebView) since NativeAudio has been unreliable
   - Remove the countdown-specific methods or keep them as no-ops for backward compat
   - The `unlock()` call on workout start still creates/resumes the AudioContext (satisfies iOS autoplay policy)

4. **Update `WorkoutLogger.tsx`**:
   - Keep the `restTimerAudio.unlock()` call on set completion (user gesture = iOS autoplay satisfied)
   - Remove `restTimerAudio.preload()` calls (no asset to preload)

### Why This Works
- Synthesized audio has **zero load time** — no fetch, no decode, no cache
- AudioContext is already unlocked by the user tap (completing a set)
- The sound plays exactly once at timer completion — no 3-second pre-trigger, no retry logic, no keepalive
- Works on both native (Capacitor WKWebView) and web (PWA)

---

## Files Modified

| File | Change |
|---|---|
| `src/hooks/usePushNotifications.ts` | Simplify detection, add retry, add logging, fix types |
| `supabase/functions/send-push-notification/index.ts` | Add detailed logging |
| `src/services/RestTimerAudioService.ts` | Add `playCompletionAlarm()` with synthesized two-tone chime |
| `src/components/workout/InlineRestTimer.tsx` | Remove 3s countdown logic, play alarm at done only |
| `src/components/workout/FloatingRestTimer.tsx` | Same simplification |
| `src/components/WorkoutLogger.tsx` | Remove `preload()` calls, keep `unlock()` |

