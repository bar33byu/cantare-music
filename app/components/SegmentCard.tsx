"use client";

import React from "react";
import { Segment, MemoryRating } from "../types/index";
import RatingBar from "./RatingBar";
import KnowledgeBar from "./KnowledgeBar";
import { getSegmentKnowledgePercent } from "../lib/knowledgeUtils";

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
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const SegmentCard: React.FC<SegmentCardProps> = ({
  segment,
  currentRating,
  onRate,
  isLocked,
  onToggleLock,
  playbackMs,
  onSeek,
}) => {
  const clampedPlaybackMs = Math.min(
    segment.endMs,
    Math.max(segment.startMs, playbackMs ?? segment.startMs)
  );

  return (
    <div className="relative mx-auto w-full max-w-xl rounded-[28px] border border-gray-200 bg-white px-6 py-7 shadow-md">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-indigo-500">
            Current Segment
          </p>
          <h2 className="mt-2 text-2xl font-bold text-gray-800">{segment.label}</h2>
        </div>
        <button
          aria-label="Toggle lock"
          data-testid="lock-toggle"
          onClick={onToggleLock}
          className="ml-3 flex-shrink-0 text-sm px-3 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          {isLocked ? "Locked" : "Unlocked"}
        </button>
      </div>
      <p
        data-testid="segment-lyric-text"
        className="mb-5 text-center text-2xl leading-relaxed text-slate-700"
      >
        {segment.lyricText || "No lyrics for this segment yet."}
      </p>
      <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3">
        <input
          type="range"
          min={segment.startMs}
          max={segment.endMs}
          value={clampedPlaybackMs}
          onChange={(event) => onSeek?.(Number(event.target.value))}
          data-testid="segment-scrubber"
          className="w-full"
        />
        <div className="mt-2 flex justify-between text-sm text-indigo-700">
          <span data-testid="segment-start-time">{formatMs(segment.startMs)}</span>
          <span data-testid="segment-current-time">{formatMs(clampedPlaybackMs)}</span>
          <span data-testid="segment-end-time">{formatMs(segment.endMs)}</span>
        </div>
      </div>
      <RatingBar
        currentRating={currentRating}
        onRate={onRate}
        disabled={isLocked}
      />
      <div className="mt-4">
        <KnowledgeBar
          percent={currentRating ? getSegmentKnowledgePercent(currentRating) : 0}
          label="Knowledge"
        />
      </div>
    </div>
  );
};

export default SegmentCard;
