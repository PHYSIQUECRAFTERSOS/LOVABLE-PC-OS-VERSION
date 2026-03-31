import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Forces iOS WebKit to repaint the underlying compositor layers
 * when a full-screen overlay unmounts or becomes hidden.
 *
 * The fix works by toggling a GPU-composited transform on unmount,
 * which forces WebKit to re-composite all fixed layers.
 */
function triggerIOSOverlayRepaint() {
  if (typeof document === "undefined") return;

  requestAnimationFrame(() => {
    document.body.style.transform = "translateZ(0)";
    requestAnimationFrame(() => {
      document.body.style.transform = "";
    });
  });
}

export function useIOSOverlayRepaint(isVisible = true) {
  const wasVisibleRef = useRef(isVisible);

  useEffect(() => {
    if (wasVisibleRef.current && !isVisible) {
      triggerIOSOverlayRepaint();
    }

    wasVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (wasVisibleRef.current) {
        triggerIOSOverlayRepaint();
      }
    };
  }, []);
}

/**
 * Shared portal container for full-screen overlays.
 * Renders children into a div appended directly to document.body,
 * bypassing the AppLayout scroll/fixed hierarchy.
 * This prevents iOS WebKit compositor bugs where fixed-position
 * overlays inside nested fixed containers cause nav displacement.
 */
let portalRoot: HTMLDivElement | null = null;

function getPortalRoot(): HTMLDivElement {
  if (!portalRoot) {
    portalRoot = document.createElement("div");
    portalRoot.id = "overlay-portal-root";
    document.body.appendChild(portalRoot);
  }
  return portalRoot;
}

export function OverlayPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, getPortalRoot());
}
