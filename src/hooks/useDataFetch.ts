import { useState, useEffect, useRef, useCallback } from "react";
import { TIMEOUTS } from "@/lib/performance";

interface UseDataFetchOptions<T> {
  queryKey: string;
  queryFn: (signal: AbortSignal) => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  timeout?: number;
  isAI?: boolean;
  fallback?: T;
  /** Keep an error distinct from valid empty data. Use for screens where an
   * empty result has product meaning (for example, no assigned workouts). */
  useFallbackOnError?: boolean;
}

interface UseDataFetchResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  timedOut: boolean;
  refetch: () => void;
}

// Simple in-memory cache (no persistent localStorage layer — that caused main-thread jank).
const cache = new Map<string, { data: any; timestamp: number }>();

// In-flight request de-duplication. Two components (or a rapid re-render /
// day switch) asking for the same key share one network round-trip instead of
// racing each other — the loser used to abort the winner's request.
const inflight = new Map<string, Promise<any>>();

// Mounted hooks subscribe here so external invalidation actually re-fetches
// what is on screen (warm resume, realtime events, mutations).
const listeners = new Map<string, Set<() => void>>();

function subscribeKey(key: string, cb: () => void) {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listeners.delete(key);
  };
}

function notifyKeys(predicate: (key: string) => boolean) {
  for (const [key, set] of Array.from(listeners.entries())) {
    if (predicate(key)) set.forEach((cb) => cb());
  }
}


// ── Performance log buffer ──
interface PerfLogEntry {
  queryKey: string;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

const perfLog: PerfLogEntry[] = [];
const MAX_PERF_LOG = 200;

function logPerf(entry: PerfLogEntry) {
  perfLog.push(entry);
  if (perfLog.length > MAX_PERF_LOG) perfLog.shift();

  if (entry.durationMs > 3000) {
    console.error(`[Perf] 🔴 SLOW: ${entry.queryKey} took ${entry.durationMs}ms (>3s limit)`);
  } else if (entry.durationMs > 2000) {
    console.warn(`[Perf] 🟡 ${entry.queryKey}: ${entry.durationMs}ms`);
  }
}

export function getPerfLog(): readonly PerfLogEntry[] {
  return perfLog;
}

export function getPerfSummary() {
  const map = new Map<string, { total: number; count: number; failures: number }>();
  for (const e of perfLog) {
    const entry = map.get(e.queryKey) || { total: 0, count: 0, failures: 0 };
    entry.total += e.durationMs;
    entry.count++;
    if (!e.success) entry.failures++;
    map.set(e.queryKey, entry);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    queryKey: key,
    avgMs: Math.round(v.total / v.count),
    calls: v.count,
    failureRate: Math.round((v.failures / v.count) * 100),
    flagged: Math.round(v.total / v.count) > 3000,
  }));
}

export function useDataFetch<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 5 * 60 * 1000,
  timeout,
  isAI = false,
  fallback,
  useFallbackOnError = true,
}: UseDataFetchOptions<T>): UseDataFetchResult<T> {
  // Honor caller-provided timeout exactly. Previous version escalated to 12–20s
  // and produced "infinite spinner" experiences when a request was actually stuck.
  const effectiveTimeout = timeout ?? (isAI ? TIMEOUTS.AI_PROCESS : TIMEOUTS.STANDARD_API);

  const [data, setData] = useState<T | undefined>(() => {
    const cached = cache.get(queryKey);
    return cached ? (cached.data as T) : undefined;
  });
  const [loading, setLoading] = useState(!cache.has(queryKey));
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const fetchData = useCallback(async (opts?: { force?: boolean }) => {
    if (!enabled) return;

    const cached = cache.get(queryKey);
    if (cached && !opts?.force && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate from in-memory only.
    if (cached) {
      setData(cached.data as T);
      setLoading(false);
    } else {
      setLoading(true);
    }

    setError(null);
    setTimedOut(false);

    const startTime = performance.now();

    // Share an in-flight request for the same key instead of racing/aborting it.
    let promise = inflight.get(queryKey) as Promise<T> | undefined;
    if (!promise) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
      promise = (async () => {
        try {
          const result = await queryFnRef.current(controller.signal);
          cache.set(queryKey, { data: result, timestamp: Date.now() });
          return result;
        } finally {
          clearTimeout(timeoutId);
          inflight.delete(queryKey);
        }
      })();
      inflight.set(queryKey, promise);
    }

    try {
      const result = await promise;
      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);
      logPerf({ queryKey, durationMs: elapsed, success: true, timestamp: Date.now() });
      setData(result);
      setLoading(false);
    } catch (err: any) {
      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);

      if (err?.name === "AbortError") {
        console.warn(`[useDataFetch] ⏱ timeout after ${elapsed}ms — ${queryKey}`);
        logPerf({ queryKey, durationMs: elapsed, success: false, error: "timeout", timestamp: Date.now() });
        if (cached) {
          setData(cached.data as T);
        } else {
          setTimedOut(true);
          if (useFallbackOnError && fallback !== undefined) setData(fallback);
        }
      } else {
        logPerf({ queryKey, durationMs: elapsed, success: false, error: err?.message, timestamp: Date.now() });
        console.error(`[Perf] ${queryKey} error:`, err?.message);
        if (cached) {
          setData(cached.data as T);
        } else {
          setError(err?.message ?? "Request failed");
          if (useFallbackOnError && fallback !== undefined && !data) setData(fallback);
        }
      }
      setLoading(false);
    }
  }, [queryKey, enabled, staleTime, effectiveTimeout, useFallbackOnError]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  // Re-fetch on external invalidation of this exact key.
  useEffect(() => {
    if (!enabled) return;
    return subscribeKey(queryKey, () => { void fetchData({ force: true }); });
  }, [queryKey, enabled, fetchData]);

  const refetch = useCallback(() => { void fetchData({ force: true }); }, [fetchData]);

  return { data, loading, error, timedOut, refetch };
}


// Clear specific cache entry (and re-fetch it if a mounted hook is showing it)
export function invalidateCache(queryKey: string) {
  cache.delete(queryKey);
  notifyKeys((k) => k === queryKey);
}

// Clear all cache entries whose key starts with a given prefix
export function invalidateCacheByPrefix(prefix: string) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  notifyKeys((k) => k.startsWith(prefix));
}

// Clear all cache
export function clearCache() {
  cache.clear();
  notifyKeys(() => true);
}


// Prime the cache from outside the hook (used by nav hover/touch prefetch).
export async function primeQuery<T>(
  queryKey: string,
  queryFn: (signal: AbortSignal) => Promise<T>,
  staleTime = 2 * 60 * 1000,
): Promise<void> {
  const cached = cache.get(queryKey);
  if (cached && Date.now() - cached.timestamp < staleTime) return;
  if (inflight.has(queryKey)) return; // a live hook is already fetching this key
  try {
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const result = await queryFn(controller.signal);
        cache.set(queryKey, { data: result, timestamp: Date.now() });
        return result;
      } finally {
        inflight.delete(queryKey);
      }
    })();
    inflight.set(queryKey, promise);
    await promise;
  } catch { /* best effort */ }

}
