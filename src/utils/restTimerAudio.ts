/**
 * Rest Timer Completion Audio
 *
 * SINGLE SOURCE OF TRUTH for the rest-timer completion sound.
 *
 * Two firing paths — both keyed to a wall-clock `endTime`:
 *   A. Foreground (native): our own AudioMixPlugin plays the bundled
 *      `rest-timer-complete.mp3` through an AVAudioPlayer that we own,
 *      with AVAudioSession forced to `.playback + .mixWithOthers`. This
 *      mixes with Spotify / Apple Music without pausing or ducking.
 *      Foreground (web): HTMLAudioElement.
 *   B. Background / locked screen: LocalNotifications scheduled at endTime
 *      with the bundled MP3 as notification sound. Cancelled the moment
 *      Path A successfully fires to prevent double-play.
 *
 * We intentionally do NOT use @capacitor-community/native-audio — it
 * re-asserts AVAudioSession without .mixWithOthers and stops Spotify.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import AudioMixPlugin from "@/plugins/AudioMixPlugin";

const WEB_ASSET_URL = "/sounds/rest-timer-complete.mp3";
// LocalNotifications iOS sound name — file must exist at bundle ROOT
// (ios/App/App/rest-timer-complete.mp3). Survives `cap copy`.
const NOTIFICATION_SOUND = "rest-timer-complete.mp3";

let preloaded = false;
let preloadPromise: Promise<void> | null = null;
let notifPermissionRequested = false;
let webAudio: HTMLAudioElement | null = null;

const isNative = () => Capacitor.isNativePlatform();

/** Preload the cue. Idempotent. Safe to call from any user gesture. */
export async function preloadRestTimerAudio(): Promise<void> {
  if (preloaded) return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      if (isNative()) {
        await AudioMixPlugin.enableMixing().catch(() => undefined);
        await AudioMixPlugin.preloadRestTimerCue().catch((err) => {
          console.warn("[RestTimerAudio] preloadRestTimerCue failed:", err);
        });
      } else {
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
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: "",
          body: " ",
          schedule: { at: new Date(endTime), allowWhileIdle: true },
          sound: NOTIFICATION_SOUND,
          smallIcon: "ic_stat_icon_config_sample",
        },
      ],
    });
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
    if (isNative()) {
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

    // Web fallback
    if (!webAudio) webAudio = new Audio(WEB_ASSET_URL);
    try { webAudio.currentTime = 0; } catch { /* ignore */ }
    await webAudio.play().catch((err) => {
      console.warn("[RestTimerAudio] web play failed:", err);
    });
  } catch (err) {
    console.error("[RestTimerAudio] playCompletionSound error:", err);
  }
}
