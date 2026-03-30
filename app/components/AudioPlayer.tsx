"use client";

import { useEffect } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

interface AudioPlayerProps {
  audioUrl: string;
  startMs: number;
  endMs: number;
  onTimeChange?: (ms: number) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AudioPlayer({ audioUrl, startMs, endMs, onTimeChange }: AudioPlayerProps) {
  const { isPlaying, currentMs, play, pause, seek } = useAudioPlayer(audioUrl);

  useEffect(() => {
    onTimeChange?.(currentMs);
  }, [currentMs, onTimeChange]);

  useEffect(() => {
    if (!audioUrl) {
      return;
    }
    pause();
    seek(startMs);
  }, [audioUrl, startMs, pause, seek]);

  if (!audioUrl) {
    return (
      <div
        data-testid="audio-player-no-audio"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        This song does not have an audio file yet.
      </div>
    );
  }

  const durationMs = Math.max(0, endMs - startMs);
  const isWithinSegment = currentMs >= startMs && currentMs <= endMs;
  const effectiveCurrentMs = isWithinSegment ? currentMs : startMs;
  const relativeCurrentMs = Math.max(0, effectiveCurrentMs - startMs);

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
      return;
    }

    const resumeMs = currentMs >= startMs && currentMs < endMs ? currentMs : startMs;
    play(resumeMs, endMs);
  };

  const handleRestart = () => {
    seek(startMs);
    play(startMs, endMs);
  };

  return (
    <div
      data-testid="audio-player"
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Segment Audio</p>
          <p className="text-xs text-gray-500">Play, pause, and scrub within this segment.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestart}
            data-testid="audio-restart"
            className="rounded-full border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            data-testid="audio-play-pause"
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={durationMs}
          value={relativeCurrentMs}
          onChange={(event) => seek(startMs + Number(event.target.value))}
          data-testid="audio-slider"
          className="w-full"
        />
        <div className="mt-2 flex justify-between text-sm text-gray-500">
          <span data-testid="audio-current-time">{formatMs(relativeCurrentMs)}</span>
          <span data-testid="audio-duration">{formatMs(durationMs)}</span>
        </div>
      </div>
    </div>
  );
}