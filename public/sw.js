// Physique Crafters service worker
// Strategy:
//   - Never touch backend/API traffic (Supabase REST, auth, storage, functions).
//   - HTML navigations: NETWORK-ONLY (never cached) with a minimal offline fallback.
//     This kills the "stale HTML -> stale hashed asset URL" chain that caused
//     intermittent old-build reloads.
//   - /sw.js, /version.json, /manifest.json: always network, never cached.
//   - Hashed static assets (JS/CSS/fonts/images with a content hash): stale-while-
//     revalidate. Safe because a new build produces new URLs (cache miss).
//   - Other same-origin GETs: network-first with cache fallback.
// Bump CACHE_NAME to invalidate previously cached shells.
const CACHE_NAME = 'physique-crafters-v13';

function isBackendOrApiRequest(url) {
  return (
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/auth/v1/') ||
    url.pathname.startsWith('/storage/v1/') ||
    url.pathname.startsWith('/functions/v1/')
  );
}

// Vite emits hashed filenames like `assets/index-a1b2c3d4.js`. Matching on the
// 8+ hex hash makes it safe to cache these forever — a new build produces a
// new URL, so stale content can never be served for a fresh deploy.
const HASHED_ASSET_RE = /-[0-9a-f]{8,}\.(?:js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|gif|ico)$/i;

// Deploy heartbeat + control files — always fetch fresh.
const NEVER_CACHE_PATHS = new Set(['/version.json', '/manifest.json', '/sw.js']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

const OFFLINE_HTML =
  '<html><body style="background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>You appear to be offline. Please reconnect and reopen the app.</p></body></html>';

async function networkOnlyNavigation(request) {
  try {
    // Force a fresh HTML fetch every navigation. No cache read, no cache write.
    return await fetch(request, { cache: 'no-store' });
  } catch {
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok && request.method === 'GET') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API/backend requests or cross-origin.
  if (url.origin !== self.location.origin || isBackendOrApiRequest(url)) return;

  // HTML navigations -> always network, never cached. This is the fix for
  // intermittent stale builds after reload.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkOnlyNavigation(event.request));
    return;
  }

  // Deploy-heartbeat + control files -> always network.
  if (NEVER_CACHE_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(
        () => new Response('', { status: 503 }),
      ),
    );
    return;
  }

  // Hashed immutable assets -> stale-while-revalidate (instant repeat loads).
  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else (unhashed public files) -> network-first with cache fallback.
  event.respondWith(networkFirst(event.request));
});
