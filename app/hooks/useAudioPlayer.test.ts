import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioPlayer } from './useAudioPlayer';

const makeAudioStub = () => {
  const listeners: Record<string, Array<() => void>> = {};
  const stub = {
    src: '',
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
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
  });

  it('seek() updates currentMs', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
    act(() => {
      result.current.seek(3000);
    });
    expect(result.current.currentMs).toBe(3000);
    expect(stub.currentTime).toBe(3);
  });

  it('play() calls audio.play and sets isPlaying via play event', () => {
    const { result } = renderHook(() => useAudioPlayer('test.mp3', factory));
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
});
