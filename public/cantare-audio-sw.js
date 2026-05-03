const AUDIO_CACHE_NAME = "cantare-audio-v2";
const AUDIO_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CACHED_AT_HEADER = "x-cantare-cached-at";

function isAudioRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.pathname.startsWith("/api/audio/");
}

function cacheKeyFor(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`, { method: "GET" });
}

function withCachedAt(response, cachedAt = Date.now()) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(cachedAt));
  headers.set("Cache-Control", "public, max-age=1209600");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isFresh(response) {
  const cachedAt = Number(response.headers.get(CACHED_AT_HEADER) ?? 0);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < AUDIO_MAX_AGE_MS;
}

async function touchCacheEntry(cache, key, response) {
  try {
    const refreshed = withCachedAt(response.clone());
    await cache.put(key, refreshed);
  } catch {
    // Cache refresh failures should never interrupt playback.
  }
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader ?? "");
  if (!match) return null;

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function responseFromCachedRange(response, rangeHeader) {
  const buffer = await response.arrayBuffer();
  const range = parseRange(rangeHeader, buffer.byteLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${buffer.byteLength}`,
      },
    });
  }

  const body = buffer.slice(range.start, range.end + 1);
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(body.byteLength));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${buffer.byteLength}`);
  headers.set("Cache-Control", "public, max-age=1209600");
  headers.delete(CACHED_AT_HEADER);

  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

async function cacheFullAudio(cache, key) {
  try {
    const response = await fetch(key, { cache: "reload" });
    if (response.ok && response.status === 200) {
      await cache.put(key, withCachedAt(response.clone()));
    }
  } catch {
    // Background warming is best-effort.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (!isAudioRequest(event.request)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const key = cacheKeyFor(event.request);
    const cached = await cache.match(key);
    const rangeHeader = event.request.headers.get("range");

    if (cached && isFresh(cached)) {
      event.waitUntil(touchCacheEntry(cache, key, cached));
      if (rangeHeader) {
        return responseFromCachedRange(cached.clone(), rangeHeader);
      }
      return cached;
    }

    const networkResponse = await fetch(event.request);

    if (networkResponse.ok || networkResponse.status === 206) {
      event.waitUntil(cacheFullAudio(cache, key));
    }

    return networkResponse;
  })());
});
