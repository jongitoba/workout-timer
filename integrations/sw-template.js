// Service worker template. integrations/service-worker.mjs fills in the version
// and the file list at build time and writes the result to dist/sw.js.
const VERSION = '__VERSION__';
const CACHE = `workout-timer-${VERSION}`;
const PRECACHE = __PRECACHE__;

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: everything the app needs is precached, so it starts instantly and
// works offline. A new deploy changes VERSION, which installs a fresh cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const key = request.mode === 'navigate' ? '/' : request;
  event.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)),
  );
});
