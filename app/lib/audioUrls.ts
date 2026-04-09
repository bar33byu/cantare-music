export function parseAudioKey(audioUrl: string): string | null {
  const trimmedInput = audioUrl?.trim();
  if (!trimmedInput) {
    return null;
  }

  const decodePath = (value: string): string =>
    value
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");

  const normalizeCandidate = (value: string): string => value.replace(/^\/+/, "");

  const looksLikeAudioKey = (value: string): boolean =>
    value.startsWith("audio/") || value.startsWith("users/");

  const directCandidate = normalizeCandidate(trimmedInput);
  if (looksLikeAudioKey(directCandidate)) {
    return decodePath(directCandidate);
  }

  try {
    const normalized = new URL(trimmedInput, "http://localhost");
    const path = normalized.pathname;
    const proxyPrefix = "/api/audio/";

    if (path.startsWith(proxyPrefix)) {
      const rawKey = path.slice(proxyPrefix.length);
      if (!rawKey) {
        return null;
      }
      return decodePath(rawKey);
    }

    const trimmedPath = normalizeCandidate(path);
    if (looksLikeAudioKey(trimmedPath)) {
      return decodePath(trimmedPath);
    }

    return null;
  } catch {
    return null;
  }
}

export function buildProxyAudioUrl(audioKey: string | null): string | null {
  if (!audioKey) {
    return null;
  }

  const encoded = audioKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/audio/${encoded}`;
}

export function toPlayableAudioUrl(audioUrl: string): string {
  const trimmed = audioUrl.trim();
  if (!trimmed) {
    return audioUrl;
  }

  // Keep absolute URLs (for example, public R2 objects) untouched.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const audioKey = parseAudioKey(audioUrl);
  return buildProxyAudioUrl(audioKey) ?? audioUrl;
}