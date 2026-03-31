import { useEffect } from "react";

/**
 * Forces iOS WebKit to repaint the underlying compositor layers
 * when a full-screen overlay (fixed inset-0 z-[5x/6x/7x]) unmounts.
 *
 * Without this, fixed-position elements like the AppLayout header
 * and bottom navigation can disappear on native iOS after closing
 * stacked overlay screens (e.g. Add Food → Food Detail → back → back).
 *
 * The fix works by toggling a GPU-composited transform on unmount,
 * which forces WebKit to re-composite all fixed layers.
 *
 * Safe to call on all platforms — it's a no-op repaint on non-iOS.
 */
export function useIOSOverlayRepaint() {
  useEffect(() => {
    return () => {
      requestAnimationFrame(() => {
        document.body.style.transform = "translateZ(0)";
        requestAnimationFrame(() => {
          document.body.style.transform = "";
        });
      });
    };
  }, []);
}
