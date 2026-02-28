import { useState, useEffect, useRef } from "react";
import { TIMEOUTS } from "@/lib/performance";

/**
 * Global loading state with tiered time-based transitions.
 * 
 * - Phase 1 (0-3s): Normal loading spinner
 * - Phase 2 (3-5s): "Still working..." secondary state
 * - Phase 3 (5s+): Auto-fail with retry
 * 
 * NO SPINNER POLICY: Spinners beyond 3s show secondary message.
 * Beyond 5s = hard fail.
 */
export type LoadPhase = "idle" | "loading" | "slow" | "failed";

interface UseTimedLoaderOptions {
  /** Override the slow threshold (default: 3s) */
  slowThreshold?: number;
  /** Override the fail threshold (default: 5s) */
  failThreshold?: number;
  /** Called when the loader times out */
  onTimeout?: () => void;
}

export function useTimedLoader(opts: UseTimedLoaderOptions = {}) {
  const {
    slowThreshold = TIMEOUTS.SPINNER_MAX,
    failThreshold = TIMEOUTS.STANDARD_API,
    onTimeout,
  } = opts;

  const [phase, setPhase] = useState<LoadPhase>("idle");
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTime = useRef<number>(0);

  const start = () => {
    cleanup();
    startTime.current = performance.now();
    setPhase("loading");

    slowTimer.current = setTimeout(() => {
      setPhase("slow");
      console.warn(`[Perf] Loader exceeded ${slowThreshold}ms — showing secondary state`);
    }, slowThreshold);

    failTimer.current = setTimeout(() => {
      setPhase("failed");
      console.error(`[Perf] Loader exceeded ${failThreshold}ms — auto-failing`);
      onTimeout?.();
    }, failThreshold);
  };

  const stop = () => {
    cleanup();
    const elapsed = Math.round(performance.now() - startTime.current);
    if (elapsed > 2000) {
      console.warn(`[Perf] Load completed in ${elapsed}ms (slow)`);
    }
    setPhase("idle");
  };

  const fail = () => {
    cleanup();
    setPhase("failed");
  };

  const cleanup = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    if (failTimer.current) clearTimeout(failTimer.current);
    slowTimer.current = null;
    failTimer.current = null;
  };

  useEffect(() => cleanup, []);

  return { phase, start, stop, fail };
}
