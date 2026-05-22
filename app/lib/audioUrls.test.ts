import { describe, expect, it } from 'vitest';
import { resolvePreferredAudioUrl, toPlayableAudioUrl } from './audioUrls';

describe('toPlayableAudioUrl', () => {
  it('returns absolute URLs unchanged', () => {
    const url = 'https://pub-example.r2.dev/audio/song-1/test.mp3';
    expect(toPlayableAudioUrl(url)).toBe(url);
  });

  it('returns trimmed audio URLs as-is', () => {
    const source = 'https://cdn.example.com/audio/song-1/test%20file.mp3';
    expect(toPlayableAudioUrl(source)).toBe(source);
  });

  it('trims whitespace from URLs', () => {
    const source = '  https://cdn.example.com/audio/song-1/test.mp3  ';
    expect(toPlayableAudioUrl(source)).toBe('https://cdn.example.com/audio/song-1/test.mp3');
  });

  it('returns empty string as empty string', () => {
    expect(toPlayableAudioUrl('')).toBe('');
  });
});

describe('resolvePreferredAudioUrl', () => {
  it('uses part audio by default', () => {
    expect(resolvePreferredAudioUrl({
      audioUrl: 'https://cdn.example.com/part.mp3',
      alternateAudioUrl: 'https://cdn.example.com/blend.mp3',
    })).toBe('https://cdn.example.com/part.mp3');
  });

  it('uses blend audio when preferred and available', () => {
    expect(resolvePreferredAudioUrl({
      audioUrl: 'https://cdn.example.com/part.mp3',
      alternateAudioUrl: 'https://cdn.example.com/blend.mp3',
    }, 'blend')).toBe('https://cdn.example.com/blend.mp3');
  });

  it('falls back when the preferred audio version is missing', () => {
    expect(resolvePreferredAudioUrl({ audioUrl: 'https://cdn.example.com/part.mp3' }, 'blend')).toBe('https://cdn.example.com/part.mp3');
    expect(resolvePreferredAudioUrl({ alternateAudioUrl: 'https://cdn.example.com/blend.mp3' }, 'part')).toBe('https://cdn.example.com/blend.mp3');
  });
});
