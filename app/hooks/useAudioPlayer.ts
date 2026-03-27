import { useEffect, useRef, useState } from 'react';

export interface AudioPlayerControls {
  isPlaying: boolean;
  currentMs: number;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  useEffect(() => {
    const audio = audioFactory(audioUrl);
    audioRef.current = audio;

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

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [audioUrl, audioFactory]);

  const play = (startMs: number, endMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = startMs / 1000;
    endMsRef.current = endMs;
    try {
      const result = audio.play();
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      // jsdom does not implement audio.play()
    }
  };

  const pause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  };

  const seek = (ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  };

  return { isPlaying, currentMs, play, pause, seek };
}
