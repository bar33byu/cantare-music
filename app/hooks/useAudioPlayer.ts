import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioPlayerControls {
  isPlaying: boolean;
  isReady: boolean;
  currentMs: number;
  durationMs: number;
  playbackError: string | null;
  play: (startMs: number, endMs: number) => void;
  pause: () => void;
  seek: (ms: number) => void;
}

type AudioFactory = (url: string) => HTMLAudioElement;

const defaultFactory: AudioFactory = (url) => new Audio(url);

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
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const startPlayback = useCallback((audio: HTMLAudioElement, startMs: number, endMs: number) => {
    setPlaybackError(null);
    pendingSeekMsRef.current = startMs;
    endMsRef.current = Number.isFinite(endMs) ? endMs : 0;
    audio.currentTime = startMs / 1000;
    setCurrentMs(startMs);

    try {
      const result = audio.play();
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Playback failed';
          setPlaybackError(message);
          setIsPlaying(false);
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback failed';
      setPlaybackError(message);
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setCurrentMs(0);
    setDurationMs(0);
    setPlaybackError(null);
    endMsRef.current = 0;
    pendingPlayRangeRef.current = null;

    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = audioFactory(audioUrl);
    audioRef.current = audio;

    if ('preload' in audio) {
      audio.preload = 'auto';
    }

    const flushPendingPlay = () => {
      if (!pendingPlayRangeRef.current) {
        return;
      }

      const { startMs, endMs } = pendingPlayRangeRef.current;
      pendingPlayRangeRef.current = null;
      startPlayback(audio, startMs, endMs);
    };

    const handleTimeUpdate = () => {
      const ms = audio.currentTime * 1000;
      setCurrentMs(ms);
      if (endMsRef.current > 0 && ms >= endMsRef.current) {
        audio.pause();
        setIsPlaying(false);
        endMsRef.current = 0;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleCanPlay = () => {
      setIsReady(true);
      flushPendingPlay();
    };
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDurationMs(audio.duration * 1000);
      }
      // Metadata availability is enough to allow user-triggered playback.
      setIsReady(true);
      if (pendingSeekMsRef.current !== null) {
        audio.currentTime = pendingSeekMsRef.current / 1000;
      }
      if (audio.readyState >= 2) {
        setIsReady(true);
        flushPendingPlay();
      }
    };
    const handleError = () => {
      const mediaError = audio.error;
      const errorCode = mediaError?.code;
      const detail = mediaError?.message ? ` (${mediaError.message})` : '';
      setPlaybackError(
        errorCode
          ? `Unable to load audio (code ${errorCode})${detail}`
          : `Unable to load audio for this song${detail}`
      );
      setIsReady(false);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.load?.();

    if (pendingSeekMsRef.current !== null) {
      audio.currentTime = pendingSeekMsRef.current / 1000;
    }

    if (audio.readyState >= 2) {
      setIsReady(true);
      flushPendingPlay();
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, [audioUrl, audioFactory, startPlayback]);

  const play = useCallback((startMs: number, endMs: number) => {
    const audio = audioRef.current;
    if (!audio || !isReady) {
      pendingSeekMsRef.current = startMs;
      pendingPlayRangeRef.current = { startMs, endMs };
      setCurrentMs(startMs);
      return;
    }
    startPlayback(audio, startMs, endMs);
  }, [isReady, startPlayback]);

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

  return { isPlaying, isReady, currentMs, durationMs, playbackError, play, pause, seek };
}
