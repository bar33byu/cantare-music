import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioPlayer } from './useAudioPlayer';

const makeAudioStub = () => {
  const listeners: Record<string, Array<() => void>> = {};
  const stub = {
    src: '',
    currentTime: 0,
    duration: 12,
    preload: 'none',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn(),
    emit: (event: string) => {
      (listeners[event] || []).forEach((cb) => cb());
    },
  };
  return stub;
};

let stub: ReturnType<typeof makeAudioStub>;
let factory: (url: string) => HTMLAudioElement;
const mockFetch = vi.fn();

beforeEach(() => {
  stub = makeAudioStub();
  factory = vi.fn().mockReturnValue(stub) as unknown as (url: string) => HTMLAudioElement;
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
  });
  global.URL.createObjectURL = vi.fn(() => 'blob:cached-audio');
});

describe('useAudioPlayer', () => {
  it('initial state has isPlaying=false and currentMs=0', async () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentMs).toBe(0);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetch).toHaveBeenCalledWith('test.mp3', { cache: 'force-cache' });
  });

  it('seek() updates currentMs', async () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.seek(3000);
    });
    expect(result.current.currentMs).toBe(3000);
    expect(stub.currentTime).toBe(3);
  });

  it('play() calls audio.play and sets isPlaying via play event', async () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.play(0, 5000);
    });
    expect(stub.play).toHaveBeenCalled();
    act(() => {
      stub.emit('play');
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('pause() calls audio.pause and clears isPlaying via pause event', async () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      stub.emit('play');
    });
    act(() => {
      result.current.pause();
    });
    expect(stub.pause).toHaveBeenCalled();
    act(() => {
      stub.emit('pause');
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('tracks audio duration from loaded metadata', async () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      stub.emit('loadedmetadata');
    });
    expect(result.current.durationMs).toBe(12000);
  });

  it('queues play requests made before audio is ready', async () => {
    let resolveFetch: ((value: any) => void) | undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));

    act(() => {
      result.current.play(2000, 5000);
    });

    await act(async () => {
      resolveFetch?.({
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      });
      await Promise.resolve();
    });

    expect(stub.play).toHaveBeenCalled();
    expect(stub.currentTime).toBe(2);
  });
});
