import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
