import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioPlayerControls {
  isPlaying: boolean;
  isReady: boolean;
  currentMs: number;
  durationMs: number;
  play: (startMs: number, endMs: number) => void;
  pause: () => void;
  seek: (ms: number) => void;
}

type AudioFactory = (url: string) => HTMLAudioElement;

const defaultFactory: AudioFactory = (url) => new Audio(url);

const inMemoryAudioCache = new Map<string, Promise<string>>();
const objectUrlCache = new Map<string, string>();

async function resolveCachedAudioUrl(url: string): Promise<string> {
  if (!url) {
    return url;
  }

  if (objectUrlCache.has(url)) {
    return objectUrlCache.get(url)!;
  }

  const existingRequest = inMemoryAudioCache.get(url);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      let response: Response | undefined;

      if (typeof window !== 'undefined' && 'caches' in window) {
        const cache = await window.caches.open('cantare-audio-v1');
        response = await cache.match(url);

        if (!response) {
          const networkResponse = await fetch(url, { cache: 'force-cache' });
          if (!networkResponse.ok) {
            throw new Error(`Failed to fetch audio: ${networkResponse.status}`);
          }
          await cache.put(url, networkResponse.clone());
          response = networkResponse;
        }
      } else {
        response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlCache.set(url, objectUrl);
      return objectUrl;
    } catch (error) {
      console.error('Audio preload failed, falling back to direct URL:', error);
      return url;
    }
  })();

  inMemoryAudioCache.set(url, request);
  return request;
}

export function useAudioPlayer(
  audioUrl: string,
  audioFactory: AudioFactory = defaultFactory
): AudioPlayerControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endMsRef = useRef<number>(0);
  const pendingSeekMsRef = useRef<number | null>(null);
  const pendingPlayRangeRef = useRef<{ startMs: number; endMs: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    let disposed = false;
    let audio: HTMLAudioElement | null = null;

    setIsReady(false);
    setIsPlaying(false);
    setDurationMs(0);

    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const initializeAudio = async () => {
      const resolvedUrl = await resolveCachedAudioUrl(audioUrl);
      if (disposed) {
        return;
      }

      audio = audioFactory(resolvedUrl);
      audioRef.current = audio;

      if ('preload' in audio) {
        audio.preload = 'auto';
      }

      const handleTimeUpdate = () => {
        const ms = audio!.currentTime * 1000;
        setCurrentMs(ms);
        if (endMsRef.current > 0 && ms >= endMsRef.current) {
          audio!.pause();
          setIsPlaying(false);
          endMsRef.current = 0;
        }
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);
      const handleLoadedMetadata = () => {
        if (Number.isFinite(audio!.duration)) {
          setDurationMs(audio!.duration * 1000);
        }
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.load?.();

      if (pendingSeekMsRef.current !== null) {
        audio.currentTime = pendingSeekMsRef.current / 1000;
      }

      setIsReady(true);

      if (pendingPlayRangeRef.current) {
        const { startMs, endMs } = pendingPlayRangeRef.current;
        pendingPlayRangeRef.current = null;
        endMsRef.current = endMs;
        audio.currentTime = startMs / 1000;
        try {
          const result = audio.play();
          if (result instanceof Promise) result.catch(() => {});
        } catch {
          // jsdom does not implement audio.play()
        }
      }

      return () => {
        audio?.removeEventListener('timeupdate', handleTimeUpdate);
        audio?.removeEventListener('play', handlePlay);
        audio?.removeEventListener('pause', handlePause);
        audio?.removeEventListener('ended', handleEnded);
        audio?.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio?.pause();
      };
    };

    let cleanup: (() => void) | undefined;
    initializeAudio().then((teardown) => {
      cleanup = teardown;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [audioUrl, audioFactory]);

  const play = useCallback((startMs: number, endMs: number) => {
    const audio = audioRef.current;
    if (!audio) {
      pendingSeekMsRef.current = startMs;
      pendingPlayRangeRef.current = { startMs, endMs };
      setCurrentMs(startMs);
      return;
    }
    audio.currentTime = startMs / 1000;
    pendingSeekMsRef.current = startMs;
    endMsRef.current = endMs;
    try {
      const result = audio.play();
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      // jsdom does not implement audio.play()
    }
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    pendingPlayRangeRef.current = null;
    if (!audio) return;
    audio.pause();
  }, []);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    pendingSeekMsRef.current = ms;
    if (audio) {
      audio.currentTime = ms / 1000;
    }
    setCurrentMs(ms);
  }, []);

  return { isPlaying, isReady, currentMs, durationMs, play, pause, seek };
}
