/**
 * Route prefetch registry.
 *
 * Vite deduplicates dynamic `import()` calls by module URL — so calling the
 * factory here on hover triggers the chunk download, and when React Router
 * mounts the same lazy component, the module is already resolved (no wait).
 *
 * Every path in AppLayout's nav should map to its lazy loader factory. Keep in
 * sync with `src/App.tsx`.
 */

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/training": () => import("@/pages/Training"),
  "/nutrition": () => import("@/pages/Nutrition"),
  "/messages": () => import("@/pages/Messages"),
  "/progress": () => import("@/pages/Progress"),
  "/profile": () => import("@/pages/Profile"),
  "/calendar": () => import("@/pages/Calendar"),
  "/community": () => import("@/pages/Community"),
  "/courses": () => import("@/pages/Courses"),
  "/challenges": () => import("@/pages/Challenges"),
  "/ranked": () => import("@/pages/Ranked"),
  "/team": () => import("@/pages/Team"),
  "/clients": () => import("@/pages/Clients"),
  "/client-tracker": () => import("@/pages/ClientTracker"),
  "/libraries": () => import("@/pages/MasterLibraries"),
  "/body-stats": () => import("@/pages/BodyStats"),
  "/analytics": () => import("@/pages/Analytics"),
  "/admin": () => import("@/pages/Admin"),
};

const started = new Set<string>();

// Optional data prefetchers keyed by base path (registered from screens/nav).
// Runs once per session per path — warms the SWR cache before the tap lands.
type DataPrefetcher = () => Promise<void> | void;
const dataPrefetchers: Record<string, DataPrefetcher> = {};
const dataStarted = new Set<string>();

export function registerRouteDataPrefetch(basePath: string, fn: DataPrefetcher): void {
  dataPrefetchers[basePath] = fn;
}

export function prefetchRoute(path: string): void {
  // Extract base path (drops :params, query, hash) so `/clients/abc` still
  // warms the `/clients` loader if the caller doesn't strip it.
  const base = "/" + (path.split("?")[0].split("#")[0].split("/")[1] || "");
  const loader = loaders[base] || loaders[path];
  if (loader && !started.has(base)) {
    started.add(base);
    loader().catch(() => { started.delete(base); });
  }
  const dataFn = dataPrefetchers[base];
  if (dataFn && !dataStarted.has(base)) {
    dataStarted.add(base);
    try { Promise.resolve(dataFn()).catch(() => dataStarted.delete(base)); }
    catch { dataStarted.delete(base); }
  }
}

/**
 * Warm the highest-traffic destinations right after first paint so a coach's
 * first navigation click feels instant.
 */
export function warmCoachRoutes(): void {
  if (typeof window === "undefined") return;
  const idle = (cb: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (ric) ric(cb);
    else window.setTimeout(cb, 800);
  };
  idle(() => {
    ["/dashboard", "/messages", "/clients", "/calendar"].forEach(prefetchRoute);
  });
}

export function warmClientRoutes(): void {
  if (typeof window === "undefined") return;
  const idle = (cb: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (ric) ric(cb);
    else window.setTimeout(cb, 800);
  };
  idle(() => {
    ["/dashboard", "/calendar", "/training", "/nutrition", "/messages"].forEach(prefetchRoute);
  });
}
