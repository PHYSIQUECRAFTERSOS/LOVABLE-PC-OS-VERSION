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

// ── Persistent (localStorage) SWR cache ──
// Mirrors the in-memory cache so screens paint instantly on cold navigation.
// Namespaced by app version so a deploy invalidates everything cleanly.
const PERSIST_PREFIX = "pc.cache.v1:";
const MAX_PERSIST_BYTES = 200 * 1024; // per entry — skip large payloads
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h hard ceiling on disk

function persistKey(k: string) { return PERSIST_PREFIX + k; }

function loadPersisted<T>(queryKey: string): { data: T; timestamp: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(persistKey(queryKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; timestamp: number };
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    if (Date.now() - parsed.timestamp > PERSIST_MAX_AGE) {
      localStorage.removeItem(persistKey(queryKey));
      return null;
    }
    return parsed;
  } catch { return null; }
}

function savePersisted(queryKey: string, data: any) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ data, timestamp: Date.now() });
    if (payload.length > MAX_PERSIST_BYTES) return;
    localStorage.setItem(persistKey(queryKey), payload);
  } catch { /* quota / serialization — best effort */ }
}

function deletePersisted(queryKey: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(persistKey(queryKey)); } catch { /* noop */ }
}

function deletePersistedByPrefix(prefix: string) {
  if (typeof window === "undefined") return;
  try {
    const full = PERSIST_PREFIX + prefix;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) localStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

function hydrateFromDisk(queryKey: string) {
  if (cache.has(queryKey)) return cache.get(queryKey)!;
  const persisted = loadPersisted(queryKey);
  if (persisted) {
    cache.set(queryKey, persisted);
    return persisted;
  }
  return null;
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
  // Base timeout: what the caller (or defaults) asked for
  const baseTimeout = timeout ?? (isAI ? TIMEOUTS.AI_PROCESS : TIMEOUTS.STANDARD_API);

  // Hydrate from persistent (localStorage) cache so cold mobile navigations paint instantly.
  const [data, setData] = useState<T | undefined>(() => {
    const cached = hydrateFromDisk(queryKey);
    if (cached) return cached.data as T;
    return undefined;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    const cached = hydrateFromDisk(queryKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate: render cache instantly, revalidate silently.
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

    // When we already have cache to show, give the network far more slack
    // so slow LTE never surfaces a "Failed to load" while data is on screen.
    // Only enforce the tight timeout when the user is actually staring at a skeleton.
    const effectiveTimeout = cached ? Math.max(baseTimeout * 3, 20000) : Math.max(baseTimeout, 12000);
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    const startTime = performance.now();

    try {
      const result = await queryFn(controller.signal);
      clearTimeout(timeoutId);

      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);
      logPerf({ queryKey, durationMs: elapsed, success: true, timestamp: Date.now() });

      cache.set(queryKey, { data: result, timestamp: Date.now() });
      savePersisted(queryKey, result);
      setData(result);
      setLoading(false);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);

      if (err.name === "AbortError") {
        logPerf({ queryKey, durationMs: elapsed, success: false, error: "timeout", timestamp: Date.now() });
        // Only show the timed-out banner when there's no cache to show.
        if (cached) {
          setData(cached.data as T);
        } else {
          setTimedOut(true);
          if (fallback !== undefined) setData(fallback);
        }
      } else {
        logPerf({ queryKey, durationMs: elapsed, success: false, error: err.message, timestamp: Date.now() });
        console.error(`[Perf] ${queryKey} error:`, err.message);
        // Same rule for errors: cache wins over an error banner.
        if (cached) {
          setData(cached.data as T);
        } else {
          setError(err.message);
          if (fallback !== undefined && !data) setData(fallback);
        }
      }
      setLoading(false);
    }
  }, [queryKey, enabled, staleTime, baseTimeout]);

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

// Clear all cache entries whose key starts with a given prefix
export function invalidateCacheByPrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

// Clear all cache
export function clearCache() {
  cache.clear();
}
