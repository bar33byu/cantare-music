// Service Worker for Cantare
// Note: Audio is now served directly from R2's CDN (public R2 URLs),
// not through the /api/audio/ proxy, so no service worker caching is needed for audio.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
