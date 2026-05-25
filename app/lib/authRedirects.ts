export function getSafeAuthReturnPath(value: unknown, appBaseUrl: string): string {
  if (typeof value !== "string") {
    return "/";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) {
    return "/";
  }

  try {
    const baseUrl = new URL(appBaseUrl);
    const candidate = trimmed.startsWith("/")
      ? new URL(trimmed, baseUrl)
      : new URL(trimmed);

    if (candidate.origin !== baseUrl.origin || candidate.pathname === "/auth/verify") {
      return "/";
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return "/";
  }
}
