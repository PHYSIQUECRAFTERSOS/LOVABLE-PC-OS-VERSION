import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getPerfSummary } from "@/hooks/useDataFetch";

/**
 * Dev-only performance HUD.
 *
 * Shown when either:
 *   - The URL has `?perf=1` (any user, any env), or
 *   - `localStorage.pc.perf === "1"` is set.
 *
 * Displays the current route transition duration and the top slow queries
 * captured this session (from useDataFetch's in-memory perf log). Toggle it
 * on with `localStorage.setItem("pc.perf", "1")` in the console; off with
 * `localStorage.removeItem("pc.perf")`.
 */
const PerfHUD = () => {
  const [enabled, setEnabled] = useState(false);
  const [routeMs, setRouteMs] = useState<number | null>(null);
  const [rows, setRows] = useState<
    { queryKey: string; avgMs: number; calls: number }[]
  >([]);
  const [collapsed, setCollapsed] = useState(false);
  const [longTasks, setLongTasks] = useState<{ count: number; maxMs: number }>({
    count: 0,
    maxMs: 0,
  });
  const location = useLocation();

  // Detect the flag once on mount, then react to storage changes.
  useEffect(() => {
    const check = () => {
      try {
        const url = new URL(window.location.href);
        const on =
          url.searchParams.get("perf") === "1" ||
          localStorage.getItem("pc.perf") === "1";
        setEnabled(on);
      } catch {
        setEnabled(false);
      }
    };
    check();
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  // Measure route transition time.
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    // Give React a paint to reflect the new route before recording.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRouteMs(Math.round(performance.now() - start));
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname, enabled]);

  // Refresh slow-query rows on an interval.
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const summary = getPerfSummary()
        .sort((a, b) => b.avgMs - a.avgMs)
        .slice(0, 5);
      setRows(summary);
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 2147483647,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        color: "#e5e7eb",
        background: "rgba(10, 10, 10, 0.92)",
        border: "1px solid rgba(212, 160, 23, 0.5)",
        borderRadius: 8,
        padding: collapsed ? "6px 10px" : "10px 12px",
        minWidth: collapsed ? undefined : 260,
        maxWidth: 360,
        pointerEvents: "auto",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ color: "#D4A017", fontWeight: 700 }}>
          PERF {routeMs !== null && !collapsed ? `· route ${routeMs}ms` : ""}
        </span>
        <span style={{ opacity: 0.6, marginLeft: 8 }}>{collapsed ? "▲" : "▼"}</span>
      </div>
      {!collapsed && (
        <>
          <div style={{ opacity: 0.7, marginTop: 6, marginBottom: 4 }}>
            Top slow queries (avg ms)
          </div>
          {rows.length === 0 ? (
            <div style={{ opacity: 0.5 }}>No data yet…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.queryKey}>
                    <td
                      style={{
                        padding: "2px 0",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.queryKey}
                    >
                      {r.queryKey}
                    </td>
                    <td
                      style={{
                        padding: "2px 0",
                        textAlign: "right",
                        color: r.avgMs > 1500 ? "#f87171" : r.avgMs > 800 ? "#fbbf24" : "#4ade80",
                      }}
                    >
                      {r.avgMs}ms
                    </td>
                    <td style={{ padding: "2px 0 2px 8px", textAlign: "right", opacity: 0.6 }}>
                      ×{r.calls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ opacity: 0.5, marginTop: 6, fontSize: 10 }}>
            Toggle: localStorage.setItem("pc.perf", "1")
          </div>
        </>
      )}
    </div>
  );
};

export default PerfHUD;
