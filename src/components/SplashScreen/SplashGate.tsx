import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SPLASH } from "@/config/splash";
import AnimatedSplash from "./AnimatedSplash";

/**
 * Module-scoped cold-start flag. Set once per JS context. A background
 * resume never reloads the JS module, so this stays true only on the
 * initial cold start. Subsequent in-app navigation / resume = no replay.
 */
let coldStartConsumed = false;

function shouldShow(): boolean {
  if (SPLASH.SPLASH_SCOPE === "web" ? false : true) {
    // scope gating
  }
  const isNative = Capacitor.isNativePlatform();
  const scopeAllows =
    SPLASH.SPLASH_SCOPE === "native+web" ||
    (SPLASH.SPLASH_SCOPE === "native" && isNative) ||
    (SPLASH.SPLASH_SCOPE === "web" && !isNative);

  if (!scopeAllows) return false;

  if (SPLASH.SPLASH_TRIGGER === "every_open") return true;

  if (SPLASH.SPLASH_TRIGGER === "cold_start_per_session") {
    try {
      if (sessionStorage.getItem("pc_splash_shown") === "1") return false;
      sessionStorage.setItem("pc_splash_shown", "1");
      return true;
    } catch {
      return !coldStartConsumed;
    }
  }

  // "cold_start" — once per JS context
  if (coldStartConsumed) return false;
  coldStartConsumed = true;
  return true;
}

function detectReducedMotion(): boolean {
  if (SPLASH.SPLASH_REDUCED_MOTION === false) {
    // Config opts OUT of honoring reduced motion entirely — still
    // respect OS-level setting via media query as a safety net.
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

async function hideNativeSplash() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch (e) {
    console.warn("[Splash] Native hide skipped:", e);
  }
}

const SplashGate = () => {
  const [visible, setVisible] = useState<boolean>(() => shouldShow());
  const reducedMotion = SPLASH.SPLASH_REDUCED_MOTION && detectReducedMotion();

  // Hide native OS splash once our animated layer has painted its first frame,
  // so the transition is seamless (no black/blank gap).
  useEffect(() => {
    if (!visible) {
      // No animated splash — still ensure native splash is hidden in case it's up.
      void hideNativeSplash();
      return;
    }
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void hideNativeSplash();
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [visible]);

  if (!visible) return null;

  return (
    <AnimatedSplash
      reducedMotion={reducedMotion}
      onComplete={() => setVisible(false)}
    />
  );
};

export default SplashGate;
