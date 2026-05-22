export type PreferredAudioVersion = 'part' | 'blend';

export function toPlayableAudioUrl(audioUrl: string): string {
  // All audio URLs must be absolute URLs to public R2 CDN endpoints.
  // No proxy fallback is supported.
  return audioUrl.trim();
}

export function resolvePreferredAudioUrl(
  song: { audioUrl?: string | null; alternateAudioUrl?: string | null } | null | undefined,
  preferredAudioVersion: PreferredAudioVersion = 'part'
): string {
  const partAudioUrl = song?.audioUrl?.trim() ?? '';
  const blendAudioUrl = song?.alternateAudioUrl?.trim() ?? '';

  if (preferredAudioVersion === 'blend') {
    return blendAudioUrl || partAudioUrl;
  }

  return partAudioUrl || blendAudioUrl;
}
