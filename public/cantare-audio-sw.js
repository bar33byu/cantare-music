// Cantare offline runtime and background progress sync.
const VERSION = "v3";
const APP_CACHE = `cantare-app-${VERSION}`;
const API_CACHE = `cantare-api-${VERSION}`;
const AUDIO_CACHE = `cantare-audio-${VERSION}`;
const DB_NAME = "cantare-offline";
const QUEUE_STORE = "requests";
const USER_HEADER = "x-user-id";
const SYNCABLE_PROGRESS_PATHS = [
  /^\/api\/songs\/[^/]+\/ratings$/,
  /^\/api\/song-practice-sessions(?:\/[^/]+)?$/,
  /^\/api\/exercise-practice-sessions(?:\/[^/]+)?$/,
];
const CACHEABLE_API_PATHS = [
  /^\/api\/songs(?:\/|$)/,
  /^\/api\/playlists(?:\/|$)/,
  /^\/api\/exercises(?:\/|$)/,
  /^\/api\/shared\/playlists(?:\/|$)/,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.add(new Request("/", { cache: "reload" })).catch(() => undefined);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const currentCaches = new Set([APP_CACHE, API_CACHE, AUDIO_CACHE]);
    await Promise.all((await caches.keys())
      .filter((name) => name.startsWith("cantare-") && !currentCaches.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    await flushQueue();
  })());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "cantare-progress-sync") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CANTARE_FLUSH_OFFLINE_QUEUE") event.waitUntil(flushQueue());
  if (event.data?.type === "CANTARE_GET_OFFLINE_STATUS") event.waitUntil(notifyQueueSize());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isAudioRequest = request.destination === "audio"
    || /\.(?:mp3|m4a|wav|ogg|aac)(?:$|\?)/i.test(url.href);
  if (request.method === "GET") {
    if (url.origin === self.location.origin && CACHEABLE_API_PATHS.some((pattern) => pattern.test(url.pathname))) {
      event.respondWith(networkFirstApi(request));
    } else if (isAudioRequest && request.headers.has("range")) {
      // Media elements, especially Safari on iOS, use byte-range requests.
      // A full response from Cache Storage is not a valid substitute for the
      // requested 206 response, so let the browser preserve native range I/O.
      return;
    } else if (isAudioRequest) {
      event.respondWith(cacheFirst(request, AUDIO_CACHE));
    } else if (url.origin === self.location.origin && request.mode === "navigate") {
      event.respondWith(networkFirstNavigation(request));
    } else if (url.origin === self.location.origin && ["script", "style", "font", "image"].includes(request.destination)) {
      event.respondWith(cacheFirst(request, APP_CACHE));
    }
    return;
  }
  if (url.origin === self.location.origin && ["POST", "PATCH"].includes(request.method)
      && SYNCABLE_PROGRESS_PATHS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(networkOrQueueProgress(request));
  }
});

function apiCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.set("__cantare_user", request.headers.get(USER_HEADER) || "cookie-user");
  return new Request(url.toString(), { method: "GET" });
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  const key = apiCacheKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await cache.match("/");
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // CacheStorage rejects partial (206) media responses; never turn a successful
  // online play into a failure just because that response cannot be persisted.
  if (response.status === 200 || response.type === "opaque") {
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

async function networkOrQueueProgress(request) {
  const copy = request.clone();
  try {
    const response = await fetch(request);
    if (response.ok) await updateRatingsCache(copy);
    return response;
  } catch {
    await enqueueRequest(copy);
    await updateRatingsCache(copy);
    await self.registration.sync?.register("cantare-progress-sync").catch(() => undefined);
    await notifyQueueSize();
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { "Content-Type": "application/json", "X-Cantare-Offline": "queued" },
    });
  }
}

async function updateRatingsCache(request) {
  const url = new URL(request.url);
  if (request.method !== "POST" || !/^\/api\/songs\/[^/]+\/ratings$/.test(url.pathname)) return;
  try {
    const payload = await request.clone().json();
    if (!Array.isArray(payload.ratings)) return;
    const getRequest = new Request(url.toString(), { headers: { [USER_HEADER]: request.headers.get(USER_HEADER) || "" } });
    const cache = await caches.open(API_CACHE);
    await cache.put(apiCacheKey(getRequest), new Response(JSON.stringify({ ratings: payload.ratings }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  } catch { /* The queued write remains valid if the optimistic cache update fails. */ }
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(QUEUE_STORE)) {
        request.result.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueueRequest(request) {
  const headers = {};
  request.headers.forEach((value, name) => { headers[name] = value; });
  const body = await request.clone().arrayBuffer();
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    transaction.objectStore(QUEUE_STORE).add({
      url: request.url, method: request.method, headers, body,
      credentials: request.credentials, queuedAt: Date.now(),
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}

async function getQueuedRequests() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function deleteQueuedRequest(id) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    transaction.objectStore(QUEUE_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}

async function flushQueue() {
  const queued = await getQueuedRequests().catch(() => []);
  for (const item of queued) {
    try {
      const response = await fetch(item.url, {
        method: item.method, headers: item.headers, body: item.body,
        credentials: item.credentials || "same-origin",
      });
      if (!response.ok) break;
      await deleteQueuedRequest(item.id);
    } catch { break; }
  }
  await notifyQueueSize();
}

async function notifyQueueSize() {
  const queued = await getQueuedRequests().catch(() => []);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "CANTARE_OFFLINE_STATUS", pending: queued.length });
}
