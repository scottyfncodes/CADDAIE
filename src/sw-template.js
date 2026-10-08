/* CADDAIE service worker — generated at build time from src/sw-template.js. */
const VERSION = '__VERSION__';
const CACHE = `caddaie-${VERSION}`;
const PRECACHE = __PRECACHE__;
// Large, versioned-by-path files (swing model + runtime) survive app updates.
const RUNTIME = 'caddaie-runtime-v1';
const isRuntime = (url) => /\/(mediapipe|models)\//.test(url.pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('caddaie-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Weather and map calls go straight to the network; they are never cached.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first for the page so updates land quickly; cached shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }

  // Hashed assets are immutable: cache-first. Anything fetched later (the swing
  // analyzer's runtime and model) is cached on first use so it works offline too.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(isRuntime(url) ? RUNTIME : CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
