import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioPlayerControls {
  isPlaying: boolean;
  isReady: boolean;
  currentMs: number;
  durationMs: number;
  playbackError: string | null;
  debugInfo: AudioDebugInfo;
  play: (startMs: number, endMs: number) => void;
  pause: () => void;
  seek: (ms: number) => void;
}

export interface AudioDebugInfo {
  src: string;
  currentSrc: string;
  readyState: number;
  networkState: number;
  preload: string;
  hasUserPlayIntent: boolean;
  pendingSeekMs: number | null;
  pendingEndMs: number;
  lastEvent: string;
  lastEventAt: string;
  playAttempts: number;
  errorCode: number | null;
  errorMessage: string | null;
}

type AudioFactory = (url: string) => HTMLAudioElement;

const defaultFactory: AudioFactory = (url) => new Audio(url);

function makeDefaultDebugInfo(audioUrl: string): AudioDebugInfo {
  return {
    src: audioUrl,
    currentSrc: '',
    readyState: 0,
    networkState: 0,
    preload: 'none',
    hasUserPlayIntent: false,
    pendingSeekMs: null,
    pendingEndMs: 0,
    lastEvent: 'init',
    lastEventAt: new Date().toISOString(),
    playAttempts: 0,
    errorCode: null,
    errorMessage: null,
  };
}

export function useAudioPlayer(
  audioUrl: string,
  audioFactory: AudioFactory = defaultFactory
): AudioPlayerControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endMsRef = useRef<number>(0);
  const pendingSeekMsRef = useRef<number | null>(null);
  const pendingPlayRangeRef = useRef<{ startMs: number; endMs: number } | null>(null);
  const hasUserPlayIntentRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<AudioDebugInfo>(() => makeDefaultDebugInfo(audioUrl));

  const updateDebugInfo = useCallback((audio: HTMLAudioElement | null, eventName: string) => {
    const now = new Date().toISOString();

    setDebugInfo((previous) => ({
      ...previous,
      src: audioUrl,
      currentSrc: audio?.currentSrc ?? previous.currentSrc,
      readyState: audio?.readyState ?? previous.readyState,
      networkState: audio?.networkState ?? previous.networkState,
      preload: audio?.preload ?? previous.preload,
      hasUserPlayIntent: hasUserPlayIntentRef.current,
      pendingSeekMs: pendingSeekMsRef.current,
      pendingEndMs: endMsRef.current,
      lastEvent: eventName,
      lastEventAt: now,
      playAttempts: eventName === 'play-attempt' ? previous.playAttempts + 1 : previous.playAttempts,
      errorCode: audio?.error?.code ?? previous.errorCode,
      errorMessage: audio?.error?.message ?? previous.errorMessage,
    }));
  }, [audioUrl]);

  const applyCurrentTime = useCallback(
    (audio: HTMLAudioElement, ms: number, eventName: string) => {
      try {
        audio.currentTime = ms / 1000;
        pendingSeekMsRef.current = null;
        updateDebugInfo(audio, eventName);
      } catch {
        // Some browsers throw until metadata is available; keep seek pending.
        pendingSeekMsRef.current = ms;
        updateDebugInfo(audio, `${eventName}-deferred`);
      }
    },
    [updateDebugInfo]
  );

  const startPlayback = useCallback((audio: HTMLAudioElement, startMs: number, endMs: number) => {
    hasUserPlayIntentRef.current = true;
    lastErrorRef.current = null;
    setPlaybackError(null);
    pendingSeekMsRef.current = startMs;
    endMsRef.current = Number.isFinite(endMs) ? endMs : 0;
    if (audio.readyState === 0) {
      audio.load?.();
      updateDebugInfo(audio, 'load');
    }
    applyCurrentTime(audio, startMs, 'seek-before-play');
    setCurrentMs(startMs);
    updateDebugInfo(audio, 'play-attempt');

    try {
      const result = audio.play();
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Playback failed';
          setPlaybackError(message);
          setIsPlaying(false);
          updateDebugInfo(audio, 'play-rejected');
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback failed';
      setPlaybackError(message);
      setIsPlaying(false);
      updateDebugInfo(audio, 'play-throw');
    }
  }, [applyCurrentTime, updateDebugInfo]);

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setCurrentMs(0);
    setDurationMs(0);
    setPlaybackError(null);
    setDebugInfo(makeDefaultDebugInfo(audioUrl));
    endMsRef.current = 0;
    pendingPlayRangeRef.current = null;

    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = audioFactory(audioUrl);
    audioRef.current = audio;
    updateDebugInfo(audio, 'audio-created');

    if ('preload' in audio) {
      // Avoid eager decode/network churn before user interaction.
      audio.preload = 'none';
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
      updateDebugInfo(audio, 'canplay');
      flushPendingPlay();
    };
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDurationMs(audio.duration * 1000);
      }
      // Metadata availability is enough to allow user-triggered playback.
      setIsReady(true);
      updateDebugInfo(audio, 'loadedmetadata');
      if (pendingSeekMsRef.current !== null) {
        applyCurrentTime(audio, pendingSeekMsRef.current, 'apply-pending-seek');
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
      const errorMessage =
        errorCode
          ? `Unable to load audio (code ${errorCode})${detail}`
          : `Unable to load audio for this song${detail}`;

      // Do not surface noisy demux errors until user explicitly tries to play.
      if (hasUserPlayIntentRef.current && lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage;
        setPlaybackError(errorMessage);
      }

      setIsReady(false);
      setIsPlaying(false);
      updateDebugInfo(audio, 'error');
    };
    const handleLoadStart = () => updateDebugInfo(audio, 'loadstart');
    const handleStalled = () => updateDebugInfo(audio, 'stalled');
    const handleWaiting = () => updateDebugInfo(audio, 'waiting');
    const handleSuspend = () => updateDebugInfo(audio, 'suspend');
    const handlePlaying = () => updateDebugInfo(audio, 'playing');
    const handlePauseDebug = () => updateDebugInfo(audio, 'pause');

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('suspend', handleSuspend);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePauseDebug);

    if (pendingSeekMsRef.current !== null) {
      applyCurrentTime(audio, pendingSeekMsRef.current, 'apply-pending-seek');
    }

    // If user clicked Play before audio element initialization completed,
    // immediately consume the queued play request to avoid a deadlock.
    if (pendingPlayRangeRef.current) {
      flushPendingPlay();
    }

    if (audio.readyState >= 2) {
      setIsReady(true);
      updateDebugInfo(audio, 'already-ready');
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
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('suspend', handleSuspend);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePauseDebug);
      audio.pause();
    };
  }, [audioUrl, audioFactory, applyCurrentTime, startPlayback, updateDebugInfo]);

  const play = useCallback((startMs: number, endMs: number) => {
    hasUserPlayIntentRef.current = true;
    const audio = audioRef.current;
    if (!audio) {
      pendingSeekMsRef.current = startMs;
      pendingPlayRangeRef.current = { startMs, endMs };
      setCurrentMs(startMs);
      updateDebugInfo(null, 'play-queued-no-audio');
      return;
    }
    startPlayback(audio, startMs, endMs);
  }, [startPlayback, updateDebugInfo]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    pendingPlayRangeRef.current = null;
    if (!audio) return;
    audio.pause();
    updateDebugInfo(audio, 'pause-call');
  }, [updateDebugInfo]);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    pendingSeekMsRef.current = ms;
    if (audio) {
      applyCurrentTime(audio, ms, 'seek');
    }
    setCurrentMs(ms);
  }, [applyCurrentTime]);

  return { isPlaying, isReady, currentMs, durationMs, playbackError, debugInfo, play, pause, seek };
}
