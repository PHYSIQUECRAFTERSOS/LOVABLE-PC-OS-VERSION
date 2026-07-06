/**
 * Passive Core Web Vitals reporter. Loads the `web-vitals` library
 * lazily after first paint so it never blocks LCP, and never sends
 * any personal data — page-level performance numbers only.
 */
export function initWebVitals() {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;

  const start = () => {
    import("web-vitals")
      .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
        const report = (metric: { name: string; value: number; rating?: string; id: string }) => {
          try {
            // eslint-disable-next-line no-console
            console.log(
              `[web-vitals] ${metric.name}=${Math.round(metric.value)}ms rating=${metric.rating ?? "n/a"}`
            );
          } catch {
            /* swallow */
          }
        };
        onLCP(report);
        onCLS(report);
        onINP(report);
        onFCP(report);
        onTTFB(report);
      })
      .catch(() => {
        /* reporting endpoint unavailable — never break the app */
      });
  };

  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 2000);
  }
}
