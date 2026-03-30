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
    readyState: 0,
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

beforeEach(() => {
  stub = makeAudioStub();
  factory = vi.fn().mockReturnValue(stub) as unknown as (url: string) => HTMLAudioElement;
});

describe('useAudioPlayer', () => {
  it('initial state has isPlaying=false and currentMs=0', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentMs).toBe(0);
    expect(result.current.isReady).toBe(false);
  });

  it('seek() updates currentMs', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    act(() => {
      result.current.seek(3000);
    });
    expect(result.current.currentMs).toBe(3000);
    expect(stub.currentTime).toBe(3);
  });

  it('becomes ready after canplay', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    act(() => {
      stub.readyState = 3;
      stub.emit('canplay');
    });
    expect(result.current.isReady).toBe(true);
  });

  it('play() calls audio.play and sets isPlaying via play event', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    act(() => {
      stub.readyState = 3;
      stub.emit('canplay');
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

    it('pause() calls audio.pause and clears isPlaying via pause event', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
      act(() => {
        stub.readyState = 3;
        stub.emit('canplay');
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

  it('tracks audio duration from loaded metadata', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    act(() => {
      stub.emit('loadedmetadata');
    });
    expect(result.current.durationMs).toBe(12000);
  });

  it('queues play requests made before audio is ready', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));

    act(() => {
      result.current.play(2000, 5000);
    });

    act(() => {
      stub.readyState = 3;
      stub.emit('canplay');
    });

    expect(stub.play).toHaveBeenCalled();
    expect(stub.currentTime).toBe(2);
  });

  it('captures audio load errors', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));

    act(() => {
      stub.emit('error');
    });

    expect(result.current.playbackError).toBe('Unable to load audio for this song.');
    expect(result.current.isReady).toBe(false);
  });
});
