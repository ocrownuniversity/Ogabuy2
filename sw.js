// OGABUY service worker — caches the app shell so the software can be
// installed and reopened even with a flaky connection. Firestore/Firebase
// calls always go to the network (this only speeds up/backs up the shell).
const CACHE_NAME = "ogabuy-shell-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.addAll() is atomic — if a single file 404s, the WHOLE install
      // fails and the service worker never activates, which silently blocks
      // the install-app prompt forever. Cache each file independently instead,
      // so one bad path can't take the rest down with it.
      Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn("SW: could not cache", url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the app shell.
  // Everything else (Firebase, Firestore, CDNs, QR/image APIs) goes straight
  // to the network so live data is never served stale.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Serve from cache immediately if available, refresh in the background;
      // otherwise fall back to the network (and to cache if offline).
      return cached || network;
    })
  );
});
