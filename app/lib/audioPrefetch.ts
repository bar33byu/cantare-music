const AUDIO_CACHE_NAME = "cantare-audio-v2";

export type AudioPrefetchResult = "cached" | "downloaded" | "skipped" | "failed";

const inFlightPrefetches = new Map<string, Promise<AudioPrefetchResult>>();

function makeAudioRequest(audioUrl: string): Request {
  const url = new URL(audioUrl, window.location.origin);
  return new Request(url.toString(), {
    method: "GET",
    mode: url.origin === window.location.origin ? "same-origin" : "no-cors",
    credentials: "omit",
  });
}

export async function prefetchAudioFile(audioUrl: string): Promise<AudioPrefetchResult> {
  const normalizedUrl = audioUrl.trim();
  if (
    !normalizedUrl ||
    typeof window === "undefined" ||
    !("caches" in window) ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return "skipped";
  }

  const existing = inFlightPrefetches.get(normalizedUrl);
  if (existing) {
    return existing;
  }

  const prefetch = (async (): Promise<AudioPrefetchResult> => {
    try {
      const cache = await window.caches.open(AUDIO_CACHE_NAME);
      const request = makeAudioRequest(normalizedUrl);
      if (await cache.match(request)) {
        return "cached";
      }

      const response = await fetch(request, { cache: "force-cache" });
      if (!response.ok && response.type !== "opaque") {
        return "failed";
      }

      await cache.put(request, response.clone());
      return "downloaded";
    } catch {
      return "failed";
    }
  })();

  inFlightPrefetches.set(normalizedUrl, prefetch);
  try {
    return await prefetch;
  } finally {
    inFlightPrefetches.delete(normalizedUrl);
  }
}
