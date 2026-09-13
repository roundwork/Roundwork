// Minimal service worker — exists mainly so Android/Chrome recognizes this
// as an installable app. Caches the app shell itself so it can still open
// (though not necessarily fetch new data) if opened while briefly offline.
// This does NOT cache or intercept the license-check function call, so
// that always hits the network fresh.

const CACHE_NAME = 'roundwork-shell-v1';
const SHELL_FILES = ['/', '/index.html', '/manifest.json'];

// Relay any error happening in this worker's own context back to the page(s)
// using it, since these never reach the main page's window.onerror at all --
// without this, a real bug in here would be completely invisible.
function reportError(detail){
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'sw-error', detail }));
  });
}
self.addEventListener('error', (event) => {
  reportError(event.message || 'unknown service worker error');
});
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportError(reason && reason.message ? reason.message : String(reason));
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch((err) => {
        reportError('Install/pre-cache failed (likely one of ' + SHELL_FILES.join(', ') + ' is missing): ' + err.message);
        // Don't rethrow -- a failed pre-cache shouldn't block the app from
        // working normally, it just means offline support is degraded.
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache/interfere with the license-verification function or any
  // non-GET request -- always go straight to the network for those.
  if (event.request.method !== 'GET' || event.request.url.includes('/.netlify/functions/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
