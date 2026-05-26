export const DEFAULT_LIST_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedJsonEnvelope<T> {
  value: T;
  cachedAt: number;
}

export interface CachedJsonResult<T> {
  value: T;
  cachedAt: number;
  isFresh: boolean;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function buildUserScopedCacheKey(scope: string, userId?: string, variant?: string): string {
  const safeUserId = (userId || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "default";
  const safeVariant = variant ? `:${variant.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")}` : "";
  return `cantare:cache:v1:${safeUserId}:${scope}${safeVariant}`;
}

export function readCachedJson<T>(key: string, ttlMs: number = DEFAULT_LIST_CACHE_TTL_MS): CachedJsonResult<T> | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null") as CachedJsonEnvelope<T> | null;
    if (!parsed || typeof parsed.cachedAt !== "number" || !("value" in parsed)) {
      return null;
    }
    return {
      value: parsed.value,
      cachedAt: parsed.cachedAt,
      isFresh: Date.now() - parsed.cachedAt <= ttlMs,
    };
  } catch {
    return null;
  }
}

export function writeCachedJson<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // The live network response is still useful even if local caching is unavailable.
  }
}
