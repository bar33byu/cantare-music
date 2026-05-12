import { describe, expect, it } from 'vitest';
import { toPlayableAudioUrl } from './audioUrls';

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
