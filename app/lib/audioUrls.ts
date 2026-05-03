function decodeAudioPath(path: string): string {
  return path
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

export function parseAudioKey(audioUrl: string): string | null {
  const trimmed = audioUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    const proxyPrefix = "/api/audio/";
    if (trimmed.startsWith(proxyPrefix)) {
      const rawKey = trimmed.slice(proxyPrefix.length);
      return rawKey ? decodeAudioPath(rawKey) : null;
    }

    const trimmedPath = trimmed.replace(/^\/+/, "");
    if (trimmedPath.startsWith("audio/") || trimmedPath.includes("/audio/")) {
      return decodeAudioPath(trimmedPath);
    }

    return null;
  }

  try {
    const normalized = new URL(trimmed);
    const path = normalized.pathname;
    const proxyPrefix = "/api/audio/";

    if (path.startsWith(proxyPrefix)) {
      const rawKey = path.slice(proxyPrefix.length);
      if (!rawKey) {
        return null;
      }
      return decodeAudioPath(rawKey);
    }

    const trimmedPath = path.replace(/^\/+/, "");
    if (trimmedPath.startsWith("audio/")) {
      return decodeAudioPath(trimmedPath);
    }

    if (trimmedPath.includes("/audio/")) {
      return decodeAudioPath(trimmedPath);
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
