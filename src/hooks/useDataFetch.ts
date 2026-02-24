import { useState, useEffect, useRef, useCallback } from "react";

interface UseDataFetchOptions<T> {
  queryKey: string;
  queryFn: (signal: AbortSignal) => Promise<T>;
  enabled?: boolean;
  staleTime?: number; // ms before data is considered stale (default 5min)
  timeout?: number; // ms before request is aborted (default 5000)
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

export function useDataFetch<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes default
  timeout = 5000,
  fallback,
}: UseDataFetchOptions<T>): UseDataFetchResult<T> {
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

    // Check cache first
    const cached = cache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    // If we have stale cache, show it while fetching fresh
    if (cached) {
      setData(cached.data as T);
      setLoading(false); // Don't show loading if we have stale data
    } else {
      setLoading(true);
    }

    setError(null);
    setTimedOut(false);

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout protection
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const startTime = performance.now();

    try {
      const result = await queryFn(controller.signal);
      clearTimeout(timeoutId);

      if (!mountedRef.current) return;

      const elapsed = Math.round(performance.now() - startTime);
      if (elapsed > 2000) {
        console.warn(`[Perf] ${queryKey} took ${elapsed}ms`);
      } else {
        console.log(`[Perf] ${queryKey}: ${elapsed}ms`);
      }

      cache.set(queryKey, { data: result, timestamp: Date.now() });
      setData(result);
      setLoading(false);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      if (err.name === "AbortError") {
        console.warn(`[Perf] ${queryKey} timed out after ${timeout}ms`);
        setTimedOut(true);
        // Use stale cache or fallback
        if (cached) {
          setData(cached.data as T);
        } else if (fallback !== undefined) {
          setData(fallback);
        }
      } else {
        console.error(`[Perf] ${queryKey} error:`, err.message);
        setError(err.message);
        if (fallback !== undefined && !data) {
          setData(fallback);
        }
      }
      setLoading(false);
    }
  }, [queryKey, enabled, staleTime, timeout]);

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
