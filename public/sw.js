// Physique Crafters service worker
// Strategy:
//   - Never touch backend/API traffic (Supabase REST, auth, storage, functions).
//   - HTML documents: network-first with cache fallback (auto-picks up new builds).
//   - Hashed static assets (JS/CSS/fonts/images with a content hash in the name):
//     stale-while-revalidate — instant from cache, updated in the background.
//   - Everything else same-origin: network-first with cache fallback.
// Bump CACHE_NAME to invalidate previously cached shells.
const CACHE_NAME = 'physique-crafters-v12';

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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok && request.method === 'GET') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return new Response(
        '<html><body style="background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>You appear to be offline. Please reconnect and reopen the app.</p></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      );
    }
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API/backend requests or cross-origin.
  if (url.origin !== self.location.origin || isBackendOrApiRequest(url)) return;

  // Hashed immutable assets → stale-while-revalidate (instant repeat loads).
  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else (HTML shell, unhashed public files) → network-first so new
  // builds get picked up immediately without a manual reload.
  event.respondWith(networkFirst(event.request));
});
