/**
 * Haptics wrapper around @capacitor/haptics with safe web fallback.
 * Strong-style logging UX: distinct vibration patterns per action.
 *
 * All calls are fire-and-forget and never throw — safe to invoke from any
 * UI handler without try/catch.
 */
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const webVibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* noop */
  }
};

/** Soft tap — keypad digit press */
export const hapticTap = () => {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } else {
    webVibrate(8);
  }
};

/** Medium tap — backspace / +- adjust */
export const hapticTick = () => {
  if (isNative()) {
    Haptics.selectionChanged().catch(() => {});
  } else {
    webVibrate(12);
  }
};

/** Set logged successfully */
export const hapticSuccess = () => {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  } else {
    webVibrate([15, 40, 15]);
  }
};

/** PR celebration */
export const hapticCelebrate = () => {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Success })
      .then(() => new Promise(r => setTimeout(r, 90)))
      .then(() => Haptics.impact({ style: ImpactStyle.Heavy }))
      .catch(() => {});
  } else {
    webVibrate([20, 60, 20, 60, 40]);
  }
};

/** Warning — invalid input */
export const hapticWarn = () => {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  } else {
    webVibrate([30, 30, 30]);
  }
};
