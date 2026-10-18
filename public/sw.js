// Offline cache for the app shell. The Sheet itself is cached in IndexedDB by the app,
// so requests to Google are never cached here.
const CACHE = "prata-v1";
const scope = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(scope.pathname)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== scope.origin) return;

  // Build output under _next/static is content-hashed, so the cached copy is always right.
  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages and everything else: network first, cache as fallback for offline use.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(event.request, { ignoreSearch: true })
          .then((hit) => hit || caches.match(scope.pathname)),
      ),
  );
});
