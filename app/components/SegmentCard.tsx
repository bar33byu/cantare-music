"use client";

import React from "react";
import { Segment, MemoryRating } from "../types/index";
import RatingBar from "./RatingBar";
import { getMasteryColor } from "../lib/masteryColors";

const LYRIC_FONT_MAX_REM = 2.25; // 36px
const LYRIC_FONT_MIN_REM = 1.25; // 20px

function getAdaptiveLyricFontSize(text: string): string {
  const length = text.trim().length;

  if (length <= 80) {
    return `clamp(1.75rem, 4.4vw, ${LYRIC_FONT_MAX_REM}rem)`;
  }

  if (length <= 180) {
    return "clamp(1.5rem, 3.8vw, 2rem)";
  }

  if (length <= 320) {
    return "clamp(1.35rem, 3.2vw, 1.75rem)";
  }

  return `clamp(${LYRIC_FONT_MIN_REM}rem, 2.7vw, 1.5rem)`;
}

interface SegmentCardProps {
  segment: Segment;
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  playbackMs?: number;
  onSeek?: (ms: number) => void;
  masteryPercent?: number;
  lyricVisibilityMode?: "full" | "hint" | "hidden";
}

function toLyricHints(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token) || token.length <= 1) {
        return token;
      }
      return token[0] + token.slice(1).replace(/[A-Za-z0-9]/g, "_");
    })
    .join("");
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
  playbackMs,
  onSeek,
  masteryPercent,
  lyricVisibilityMode = "full",
}) => {
  const hasLyrics = (segment.lyricText ?? "").trim().length > 0;
  const lyricFontSize = React.useMemo(
    () => getAdaptiveLyricFontSize(segment.lyricText || ""),
    [segment.lyricText]
  );
  const displayLyricText = React.useMemo(() => {
    if (!hasLyrics) {
      return "No lyrics for this segment yet.";
    }
    if (lyricVisibilityMode === "hidden") {
      return "Lyrics hidden";
    }
    if (lyricVisibilityMode === "hint") {
      return toLyricHints(segment.lyricText);
    }
    return segment.lyricText;
  }, [hasLyrics, lyricVisibilityMode, segment.lyricText]);

  const clampedPlaybackMs = Math.min(
    segment.endMs,
    Math.max(segment.startMs, playbackMs ?? segment.startMs)
  );
  const durationMs = Math.max(1, segment.endMs - segment.startMs);
  const progress = Math.min(1, Math.max(0, (clampedPlaybackMs - segment.startMs) / durationMs));
  const topEdgeColor = getMasteryColor(masteryPercent ?? ((currentRating ?? 0) * 20));

  const handleProgressClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const offsetX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, offsetX / rect.width));
    const seekMs = Math.round(segment.startMs + ratio * durationMs);
    onSeek(seekMs);
  };

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
      <div
        data-testid="segment-mastery-edge"
        className="absolute inset-x-0 top-0 h-4 rounded-t-2xl border-b border-black/5"
        style={{ backgroundColor: topEdgeColor }}
      />
      <div className="mb-3">
        <p className="text-center text-sm text-gray-500" data-testid="segment-label-text">
          {segment.label}
        </p>
      </div>
      <div className="mb-4 min-h-0 flex-1 overflow-y-auto pr-2">
        <p
          data-testid="segment-lyric-text"
          className={`text-center ${hasLyrics && lyricVisibilityMode !== "hidden" ? "text-slate-700" : "text-gray-400"}`}
          style={{ fontSize: lyricFontSize, lineHeight: 1.4 }}
        >
          {displayLyricText}
        </p>
      </div>
      <div className="mb-3">
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="segment-progress"
          className={`h-4 w-full overflow-hidden rounded border border-indigo-300 bg-indigo-50 ${onSeek ? "cursor-pointer" : ""}`}
          onClick={handleProgressClick}
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
        disabled={false}
      />
    </div>
  );
};

export default SegmentCard;
