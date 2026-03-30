import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUploadAudio } from './useUploadAudio';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// XMLHttpRequest stub
class XMLHttpRequestStub {
  upload = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

  constructor() {
    // Simulate successful upload
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 10);
  }
}

global.XMLHttpRequest = XMLHttpRequestStub as any;

describe('useUploadAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ uploadUrl: 'https://example.com/upload', key: 'test-key' }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with uploading false', () => {
    const { result } = renderHook(() => useUploadAudio());
    expect(result.current.uploading).toBe(false);
  });

  it('upload() with oversized file sets error without calling fetch', async () => {
    const { result } = renderHook(() => useUploadAudio());

    const largeFile = new File(['x'.repeat(16_000_000)], 'large.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      try {
        await result.current.upload('song-123', largeFile);
      } catch (err) {
        // Expected to throw
      }
    });

    expect(result.current.error).toBe('File size exceeds 15MB limit');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('successful upload sets uploading=false and returns key', async () => {
    const { result } = renderHook(() => useUploadAudio());

    const file = new File(['test'], 'test.mp3', { type: 'audio/mpeg' });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: 'test-key' }),
    });

    let returnedKey: string;
    await act(async () => {
      returnedKey = await result.current.upload('song-123', file);
    });

    expect(returnedKey).toBe('test-key');
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBe(null);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/songs/upload-url');
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBeInstanceOf(FormData);
  });

  it('API error sets error string', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'API Error' }),
    });

    const { result } = renderHook(() => useUploadAudio());

    const file = new File(['test'], 'test.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      try {
        await result.current.upload('song-123', file);
      } catch (err) {
        // Expected to throw
      }
    });

    expect(result.current.error).toBe('API Error');
    expect(result.current.uploading).toBe(false);
  });
});