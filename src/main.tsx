import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-update: detect new service worker and reload to latest version
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // New SW activated — reload to pick up latest assets
          window.location.reload();
        }
      });
    });

    // Check for updates every 5 minutes while the app is open
    setInterval(() => {
      registration.update();
    }, 5 * 60 * 1000);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
