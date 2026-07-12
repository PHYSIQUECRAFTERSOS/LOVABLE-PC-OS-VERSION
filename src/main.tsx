import { createRoot } from "react-dom/client";
import { Capacitor } from '@capacitor/core';
import App from "./App.tsx";
import "./index.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { initWebVitals } from "./lib/webVitals";


// Native cache bust: clear WKWebView cache on every app launch
async function clearNativeCache() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { default: CacheBuster } = await import('./plugins/CacheBusterPlugin');
      await CacheBuster.clearCache();
      console.log('[CacheBuster] Native cache cleared');
    } catch (e) {
      console.warn('[CacheBuster] Plugin not available:', e);
    }
  }
}

// ─── Fresh-build discovery ───────────────────────────────────────────────────
// Combines two signals so a new deploy is picked up without a manual clear:
//   1) Ask the browser to check /sw.js bytes (registration.update()).
//   2) Poll /version.json (no-store) and compare to the running __BUILD_ID__.
// Runs on: ready, 5-min interval, visibilitychange -> visible, window focus.
// The existing updatefound -> activated -> reload flow does the actual swap.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "activated") {
          window.location.reload();
        }
      });
    });

    const safeUpdate = () => {
      try {
        void registration.update()?.catch(() => undefined);
      } catch {
        /* noop */
      }
    };

    const checkVersion = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (data?.buildId && data.buildId !== __BUILD_ID__) {
          // Deployed build differs from the one running in this tab. Ask the
          // browser to fetch a fresh /sw.js — the updatefound path above then
          // reloads the tab once the new worker activates.
          safeUpdate();
        }
      } catch {
        /* offline or version.json missing — ignore */
      }
    };

    const poll = () => {
      safeUpdate();
      void checkVersion();
    };

    // Kick off immediately.
    poll();

    // Periodic floor.
    setInterval(poll, 5 * 60 * 1000);

    // User returns to the tab / app.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") poll();
    });
    window.addEventListener("focus", poll);
  });
}

// Clear native cache then render
clearNativeCache().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
  initWebVitals();
});
