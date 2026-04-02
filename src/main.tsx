import { createRoot } from "react-dom/client";
import { Capacitor } from '@capacitor/core';
import App from "./App.tsx";
import "./index.css";

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

// Auto-update: detect new service worker and reload to latest version
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

    const checkForUpdates = () => {
      try {
        void registration.update()?.catch(() => undefined);
      } catch {
        return;
      }
    };

    setInterval(checkForUpdates, 5 * 60 * 1000);
  });
}

// Clear native cache then render
clearNativeCache().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
