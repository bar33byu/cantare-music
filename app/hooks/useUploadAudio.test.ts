import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUploadAudio } from './useUploadAudio';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// XMLHttpRequest stub
class XMLHttpRequestStub {
  upload = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  listeners: Record<string, Array<(event: any) => void>> = {
    load: [],
    error: [],
    abort: [],
  };
  status = 200;
  statusText = 'OK';
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

  addEventListener(event: string, handler: (event: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event].push(handler);
    }
  }

  removeEventListener(event: string, handler: (event: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  constructor() {
    // Simulate successful upload
    setTimeout(() => {
      this.listeners.load.forEach((handler) =>
        handler({ type: 'load', target: this } as any)
      );
    }, 10);
  }
}

global.XMLHttpRequest = XMLHttpRequestStub as any;

class XMLHttpRequestErrorStub {
  upload = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  listeners: Record<string, Array<(event: any) => void>> = {
    load: [],
    error: [],
    abort: [],
  };
  status = 500;
  statusText = 'Network Error';
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn(() => {
    setTimeout(() => {
      this.listeners.error.forEach((handler) =>
        handler({ type: 'error', target: this } as any)
      );
    }, 10);
  });

  addEventListener(event: string, handler: (event: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event].push(handler);
    }
  }

  removeEventListener(event: string, handler: (event: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }
}

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
      json: () => Promise.resolve({ uploadUrl: 'https://example.com/upload', key: 'test-key' }),
    });

    let returnedKey: string | undefined;
    await act(async () => {
      returnedKey = await result.current.upload('song-123', file);
    });

    expect(returnedKey).toBe('test-key');
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(mockFetch).toHaveBeenCalledWith('/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-123',
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
        size: file.size,
      }),
    });
  });

  it('API error sets error string', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('{"error":"API Error"}'),
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

  it('falls back to same-origin upload when direct upload fails', async () => {
    global.XMLHttpRequest = XMLHttpRequestErrorStub as any;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uploadUrl: 'https://example.com/upload', key: 'test-key' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'test-key' }),
      });

    const { result } = renderHook(() => useUploadAudio());
    const file = new File(['test'], 'test.mp3', { type: 'audio/mpeg' });

    let returnedKey: string | undefined;
    await act(async () => {
      returnedKey = await result.current.upload('song-123', file);
    });

    expect(returnedKey).toBe('test-key');
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/songs/upload', {
      method: 'POST',
      body: expect.any(FormData),
    });
    expect(result.current.error).toBe(null);

    global.XMLHttpRequest = XMLHttpRequestStub as any;
  });
});