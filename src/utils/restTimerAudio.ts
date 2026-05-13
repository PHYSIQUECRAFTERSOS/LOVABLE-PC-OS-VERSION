/**
 * Rest Timer Completion Audio
 *
 * SINGLE SOURCE OF TRUTH for the rest-timer completion sound.
 *
 * Two firing paths — both keyed to a wall-clock `endTime`:
 *   A. Foreground: NativeAudio (iOS/Android) or HTMLAudioElement (web)
 *      plays bundled `public/sounds/rest-timer-complete.mp3` immediately.
 *   B. Background / locked screen: LocalNotifications scheduled at endTime
 *      with the bundled MP3 as notification sound. Cancelled the moment
 *      Path A successfully fires to prevent double-play.
 *
 * NEVER fetched at runtime — file is bundled.
 * Foreground path mixes with Spotify/Apple Music (focus: false on native;
 * AudioMixPlugin already sets AVAudioSession .playback + .mixWithOthers).
 */

import { Capacitor } from "@capacitor/core";
import { NativeAudio } from "@capacitor-community/native-audio";
import { LocalNotifications } from "@capacitor/local-notifications";
import AudioMixPlugin from "@/plugins/AudioMixPlugin";

const ASSET_ID = "rest-timer-complete";
// On iOS native, NativeAudio resolves relative paths against the app bundle's
// `public/` directory (populated by `npx cap copy ios`).
const NATIVE_ASSET_PATH = "public/sounds/rest-timer-complete.mp3";
const WEB_ASSET_URL = "/sounds/rest-timer-complete.mp3";
// LocalNotifications iOS sound name — file must exist at bundle ROOT
// (ios/App/App/rest-timer-complete.mp3). Lose-free across `cap copy`.
const NOTIFICATION_SOUND = "rest-timer-complete.mp3";

let preloaded = false;
let preloadPromise: Promise<void> | null = null;
let notifPermissionRequested = false;
let webAudio: HTMLAudioElement | null = null;

const isNative = () => Capacitor.isNativePlatform();

/** Preload the MP3 + request notification permission. Idempotent. Safe to call from any user gesture. */
export async function preloadRestTimerAudio(): Promise<void> {
  if (preloaded) return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      if (isNative()) {
        await AudioMixPlugin.enableMixing().catch(() => undefined);
        await NativeAudio.preload({
          assetId: ASSET_ID,
          assetPath: NATIVE_ASSET_PATH,
          audioChannelNum: 1,
          isUrl: false,
          // CRITICAL: do NOT take audio focus — mix with Spotify/Apple Music
          focus: false,
          volume: 1.0,
        }).catch((err) => {
          // Already-loaded errors are fine
          if (!String(err?.message ?? err).toLowerCase().includes("already")) {
            console.warn("[RestTimerAudio] NativeAudio preload warning:", err);
          }
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

/** Request local-notification permission (idempotent). Failure does not block foreground audio. */
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

/**
 * Schedule a silent local notification (sound only, blank body) to fire at `endTime`.
 * Returns the notification id (or null if scheduling failed / not native / no permission).
 */
export async function scheduleBackgroundCompletion(endTime: number): Promise<number | null> {
  if (!isNative()) return null;
  if (endTime <= Date.now() + 250) return null; // too soon to schedule reliably

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const id = Math.floor(Math.random() * 2_000_000_000);
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: "",
          body: " ", // iOS requires non-empty body
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
      await NativeAudio.play({ assetId: ASSET_ID }).catch(async (err) => {
        // If asset wasn't preloaded yet (e.g., user gesture happened later), retry once
        console.warn("[RestTimerAudio] NativeAudio play retry:", err);
        await NativeAudio.preload({
          assetId: ASSET_ID,
          assetPath: NATIVE_ASSET_PATH,
          audioChannelNum: 1,
          isUrl: false,
          focus: false,
          volume: 1.0,
        }).catch(() => undefined);
        await NativeAudio.play({ assetId: ASSET_ID });
      });
      return;
    }

    // Web fallback
    if (!webAudio) {
      webAudio = new Audio(WEB_ASSET_URL);
    }
    try {
      webAudio.currentTime = 0;
    } catch {
      // ignore
    }
    await webAudio.play().catch((err) => {
      console.warn("[RestTimerAudio] web play failed:", err);
    });
  } catch (err) {
    console.error("[RestTimerAudio] playCompletionSound error:", err);
  }
}
