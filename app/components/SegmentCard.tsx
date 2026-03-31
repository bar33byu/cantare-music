"use client";

import React from "react";
import { Segment, MemoryRating } from "../types/index";
import RatingBar from "./RatingBar";

interface SegmentCardProps {
  segment: Segment;
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  playbackMs?: number;
  onSeek?: (ms: number) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const SegmentCard: React.FC<SegmentCardProps> = ({
  segment,
  currentRating,
  onRate,
  isLocked,
  onToggleLock,
  playbackMs,
}) => {
  const clampedPlaybackMs = Math.min(
    segment.endMs,
    Math.max(segment.startMs, playbackMs ?? segment.startMs)
  );
  const durationMs = Math.max(1, segment.endMs - segment.startMs);
  const progress = Math.min(1, Math.max(0, (clampedPlaybackMs - segment.startMs) / durationMs));

  return (
    <div className="relative mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-center text-sm text-gray-500" data-testid="segment-label-text">
          {segment.label}
        </p>
        <button
          aria-label="Toggle lock"
          data-testid="lock-toggle"
          onClick={onToggleLock}
          className="text-sm px-3 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          {isLocked ? "Locked" : "Unlocked"}
        </button>
      </div>
      <p
        data-testid="segment-lyric-text"
        className="mb-5 text-center text-3xl leading-relaxed text-slate-700"
      >
        {segment.lyricText || "No lyrics for this segment yet."}
      </p>
      <div className="mb-5">
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="segment-progress"
          className="h-4 w-full overflow-hidden rounded border border-indigo-300 bg-indigo-50"
        >
          <div
            data-testid="segment-progress-fill"
            className="h-full bg-amber-400"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-sm text-indigo-700">
          <span data-testid="segment-start-time">{formatMs(0)}</span>
          <span data-testid="segment-end-time">{formatMs(segment.endMs - segment.startMs)}</span>
        </div>
      </div>

      <p className="mb-2 text-sm text-gray-500">Level of knowledge</p>
      <RatingBar
        currentRating={currentRating}
        onRate={onRate}
        disabled={isLocked}
      />
    </div>
  );
};

export default SegmentCard;
