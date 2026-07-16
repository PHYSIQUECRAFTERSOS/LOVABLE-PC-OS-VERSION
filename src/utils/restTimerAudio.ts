/**
 * Rest Timer Completion Audio
 *
 * SINGLE SOURCE OF TRUTH for the rest-timer completion sound.
 *
 * Platform routing:
 *   - iOS (native): custom AudioMixPlugin plays the bundled MP3 through
 *     an AVAudioPlayer with AVAudioSession `.playback + .mixWithOthers`
 *     so audio layers over Spotify / Apple Music without ducking.
 *   - Android (native) + Web/PWA: HTMLAudioElement pointed at the bundled
 *     `/sounds/rest-timer-complete.mp3`. The Capacitor Android WebView
 *     plays it fine as long as the element is created ahead of time
 *     (during a user gesture) so the eventual `.play()` call is not
 *     blocked by autoplay policy.
 *
 * Background / locked screen: LocalNotifications scheduled at endTime.
 *   - iOS: bundled `rest-timer-complete.caf` at bundle root.
 *   - Android: references `rest_timer_complete` (no extension) from
 *     `android/app/src/main/res/raw/`. If that raw resource is absent,
 *     Android falls back to the default system notification sound so the
 *     user still hears an audible cue.
 *
 * We intentionally do NOT use @capacitor-community/native-audio — it
 * re-asserts AVAudioSession without .mixWithOthers and stops Spotify.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import AudioMixPlugin from "@/plugins/AudioMixPlugin";

const WEB_ASSET_URL = "/sounds/rest-timer-complete.mp3";

// iOS notification sound — must exist at ios bundle ROOT
// (ios/App/App/rest-timer-complete.caf). MUST be .caf/.aiff/.wav under 30s;
// iOS silently drops MP3 notification sounds.
const IOS_NOTIFICATION_SOUND = "rest-timer-complete.caf";

// Android notification sound — references res/raw/rest_timer_complete.mp3
// (lowercase + underscores per Android resource naming rules). Pass the
// resource name WITHOUT extension. If this raw resource is missing, we
// omit the field entirely so Android uses the default notification sound.
// One-time setup after `npx cap sync android`: copy
// `public/sounds/rest-timer-complete.mp3` to
// `android/app/src/main/res/raw/rest_timer_complete.mp3`.
const ANDROID_NOTIFICATION_SOUND = "rest_timer_complete";

let preloaded = false;
let preloadPromise: Promise<void> | null = null;
let notifPermissionRequested = false;
let webAudio: HTMLAudioElement | null = null;

const platform = () => Capacitor.getPlatform();
const isIOS = () => platform() === "ios";
const isAndroid = () => platform() === "android";
const isNative = () => Capacitor.isNativePlatform();
/** Everything that should use the HTMLAudioElement path. */
const usesWebAudio = () => !isIOS();

/** Preload the cue. Idempotent. Safe to call from any user gesture. */
export async function preloadRestTimerAudio(): Promise<void> {
  if (preloaded) return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      if (isIOS()) {
        await AudioMixPlugin.enableMixing().catch(() => undefined);
        await AudioMixPlugin.preloadRestTimerCue().catch((err) => {
          console.warn("[RestTimerAudio] preloadRestTimerCue failed:", err);
        });
      } else {
        // Android + Web: build the HTMLAudioElement now so the eventual
        // .play() call inherits the user-gesture grant.
        webAudio = new Audio(WEB_ASSET_URL);
        webAudio.preload = "auto";
        webAudio.load();
      }
      preloaded = true;
    } catch (err) {
      console.warn("[RestTimerAudio] preload failed:", err);
    }
  })();

  return preloadPromise;
}

/** Request local-notification permission (idempotent). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    if (notifPermissionRequested) return false;
    notifPermissionRequested = true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch (err) {
    console.warn("[RestTimerAudio] notification permission failed:", err);
    return false;
  }
}

/** Schedule a local notification (with bundled sound) for endTime. */
export async function scheduleBackgroundCompletion(endTime: number): Promise<number | null> {
  if (!isNative()) return null;
  if (endTime <= Date.now() + 250) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const id = Math.floor(Math.random() * 2_000_000_000);
  try {
    const notification: Parameters<typeof LocalNotifications.schedule>[0]["notifications"][number] = {
      id,
      // Non-empty title/body required — some iOS versions suppress the
      // custom sound when both are blank.
      title: "Rest complete",
      body: "Time for your next set 💪",
      schedule: { at: new Date(endTime), allowWhileIdle: true },
      smallIcon: "ic_stat_icon_config_sample",
    };

    if (isIOS()) {
      notification.sound = IOS_NOTIFICATION_SOUND;
    } else if (isAndroid()) {
      // Reference res/raw/rest_timer_complete.(mp3|ogg|wav). If the raw
      // resource is missing at runtime, Android falls back to the default
      // system notification sound rather than crashing.
      notification.sound = ANDROID_NOTIFICATION_SOUND;
    }

    await LocalNotifications.schedule({ notifications: [notification] });
    return id;
  } catch (err) {
    console.warn("[RestTimerAudio] schedule failed:", err);
    return null;
  }
}

export async function cancelBackgroundCompletion(id: number | null): Promise<void> {
  if (!isNative() || id == null) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch (err) {
    console.warn("[RestTimerAudio] cancel failed:", err);
  }
}

/** Play the bundled completion sound (foreground path). Mixes with other audio. */
export async function playCompletionSound(): Promise<void> {
  try {
    if (isIOS()) {
      if (!preloaded) await preloadRestTimerAudio();
      await AudioMixPlugin.enableMixing().catch(() => undefined);
      await AudioMixPlugin.playRestTimerCue().catch(async (err) => {
        console.warn("[RestTimerAudio] playRestTimerCue retry:", err);
        await AudioMixPlugin.preloadRestTimerCue().catch(() => undefined);
        await AudioMixPlugin.playRestTimerCue().catch((e) => {
          console.error("[RestTimerAudio] playRestTimerCue final failure:", e);
        });
      });
      return;
    }

    // Android (native WebView) + Web fallback — HTMLAudioElement.
    if (!webAudio) {
      webAudio = new Audio(WEB_ASSET_URL);
      webAudio.preload = "auto";
    }
    try { webAudio.currentTime = 0; } catch { /* ignore */ }
    await webAudio.play().catch((err) => {
      console.warn("[RestTimerAudio] web play failed:", err);
    });
  } catch (err) {
    console.error("[RestTimerAudio] playCompletionSound error:", err);
  }
}

// Kept for reference / potential future consumers.
void usesWebAudio;
