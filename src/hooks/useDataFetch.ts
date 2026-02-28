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
}

interface UseDataFetchResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  timedOut: boolean;
  refetch: () => void;
}

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

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

  // Flag slow endpoints
  if (entry.durationMs > 3000) {
    console.error(`[Perf] 🔴 SLOW: ${entry.queryKey} took ${entry.durationMs}ms (>3s limit)`);
  } else if (entry.durationMs > 2000) {
    console.warn(`[Perf] 🟡 ${entry.queryKey}: ${entry.durationMs}ms`);
  }
}

/** Get the performance log for admin dashboards */
export function getPerfLog(): readonly PerfLogEntry[] {
  return perfLog;
}

/** Get average duration and failure rate per query key */
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
}: UseDataFetchOptions<T>): UseDataFetchResult<T> {
  const effectiveTimeout = timeout ?? (isAI ? TIMEOUTS.AI_PROCESS : TIMEOUTS.STANDARD_API);
  const [data, setData] = useState<T | undefined>(() => {
    const cached = cache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      return cached.data as T;
    }
    return undefined;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    const cached = cache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate
    if (cached) {
      setData(cached.data as T);
      setLoading(false);
    } else {
      setLoading(true);
    }

    setError(null);
    setTimedOut(false);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    const startTime = performance.now();

    try {
      const result = await queryFn(controller.signal);
      clearTimeout(timeoutId);

      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);
      logPerf({ queryKey, durationMs: elapsed, success: true, timestamp: Date.now() });

      cache.set(queryKey, { data: result, timestamp: Date.now() });
      setData(result);
      setLoading(false);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);

      if (err.name === "AbortError") {
        logPerf({ queryKey, durationMs: elapsed, success: false, error: "timeout", timestamp: Date.now() });
        setTimedOut(true);
        if (cached) {
          setData(cached.data as T);
        } else if (fallback !== undefined) {
          setData(fallback);
        }
      } else {
        logPerf({ queryKey, durationMs: elapsed, success: false, error: err.message, timestamp: Date.now() });
        console.error(`[Perf] ${queryKey} error:`, err.message);
        setError(err.message);
        if (fallback !== undefined && !data) {
          setData(fallback);
        }
      }
      setLoading(false);
    }
  }, [queryKey, enabled, staleTime, effectiveTimeout]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchData]);

  return { data, loading, error, timedOut, refetch: fetchData };
}

// Clear specific cache entry
export function invalidateCache(queryKey: string) {
  cache.delete(queryKey);
}

// Clear all cache
export function clearCache() {
  cache.clear();
}
