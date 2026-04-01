const CACHE_NAME = 'physique-crafters-v11';

function isBackendOrApiRequest(url) {
  return (
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/auth/v1/') ||
    url.pathname.startsWith('/storage/v1/') ||
    url.pathname.startsWith('/functions/v1/')
  );
}

self.addEventListener('install', (event) => {
  // Skip caching entirely — this app runs from a remote server inside a native WebView.
  // WKWebView + remote server means caching causes stale builds.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ALL caches on activation to guarantee a clean slate
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API/backend requests
  if (url.origin !== self.location.origin || isBackendOrApiRequest(url)) return;

  // ALL requests: network-only with cache-busting headers.
  // No writes to CacheStorage — prevents WKWebView from serving stale assets.
  event.respondWith(
    fetch(event.request, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    }).catch(() => {
      // Truly offline — return a minimal error page for navigations
      if (event.request.mode === 'navigate') {
        return new Response(
          '<html><body style="background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>You appear to be offline. Please reconnect and reopen the app.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        );
      }
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
