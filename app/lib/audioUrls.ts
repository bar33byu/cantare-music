export function parseAudioKey(audioUrl: string): string | null {
  if (!audioUrl || audioUrl.trim().length === 0) {
    return null;
  }

  try {
    const normalized = new URL(audioUrl, "http://localhost");
    const path = normalized.pathname;
    const proxyPrefix = "/api/audio/";

    if (path.startsWith(proxyPrefix)) {
      const rawKey = path.slice(proxyPrefix.length);
      if (!rawKey) {
        return null;
      }
      return rawKey
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
    }

    const trimmedPath = path.replace(/^\/+/, "");
    if (trimmedPath.startsWith("audio/")) {
      return trimmedPath
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
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
  const audioKey = parseAudioKey(audioUrl);
  return buildProxyAudioUrl(audioKey) ?? audioUrl;
}