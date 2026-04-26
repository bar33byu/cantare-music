import { describe, expect, it } from 'vitest';
import { parseAudioKey, toPlayableAudioUrl } from './audioUrls';

describe('toPlayableAudioUrl', () => {
  it('keeps absolute public URLs unchanged', () => {
    const url = 'https://pub-example.r2.dev/audio/song-1/test.mp3';
    expect(toPlayableAudioUrl(url)).toBe(url);
  });

  it('rewrites relative /audio paths to the same-origin proxy', () => {
    const source = '/audio/song-1/test file.mp3';
    expect(toPlayableAudioUrl(source)).toBe('/api/audio/audio/song-1/test%20file.mp3');
  });

  it('keeps already-proxied URLs stable', () => {
    const source = '/api/audio/audio/song-1/test%20file.mp3';
    expect(toPlayableAudioUrl(source)).toBe(source);
  });

  it('returns unknown relative URLs as-is', () => {
    const source = '/uploads/song-1/test.mp3';
    expect(toPlayableAudioUrl(source)).toBe(source);
  });
});

describe('parseAudioKey', () => {
  it('extracts user-prefixed audio keys from public URLs', () => {
    const url = 'https://cantare-audio.r2.dev/users/default/audio/song-1/test%20file.mp3';
    expect(parseAudioKey(url)).toBe('users/default/audio/song-1/test file.mp3');
  });

  it('extracts user-prefixed audio keys from relative paths', () => {
    const source = '/users/default/audio/song-1/test%20file.mp3';
    expect(parseAudioKey(source)).toBe('users/default/audio/song-1/test file.mp3');
  });
});
