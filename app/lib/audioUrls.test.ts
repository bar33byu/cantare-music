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

  it('rewrites users-scoped keys to same-origin proxy', () => {
    const source = 'users/default/audio/song-1/test file.mp3';
    expect(toPlayableAudioUrl(source)).toBe('/api/audio/users/default/audio/song-1/test%20file.mp3');
  });
});

describe('parseAudioKey', () => {
  it('extracts users-scoped key from absolute public URL path', () => {
    const source = 'https://pub-example.r2.dev/users/default/audio/song-1/test%20file.mp3';
    expect(parseAudioKey(source)).toBe('users/default/audio/song-1/test file.mp3');
  });

  it('extracts users-scoped key from already proxied URL', () => {
    const source = '/api/audio/users/default/audio/song-1/test%20file.mp3';
    expect(parseAudioKey(source)).toBe('users/default/audio/song-1/test file.mp3');
  });
});
