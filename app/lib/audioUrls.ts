export function toPlayableAudioUrl(audioUrl: string): string {
  // All audio URLs must be absolute URLs to public R2 CDN endpoints.
  // No proxy fallback is supported.
  return audioUrl.trim();
}
