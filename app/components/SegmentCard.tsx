"use client";

import React from "react";
import { Segment, MemoryRating } from "../types/index";
import RatingBar from "./RatingBar";
import { PitchContourThumbnail } from "./PitchContourThumbnail";

const LYRIC_FONT_MAX_REM = 2.25; // 36px
const LYRIC_FONT_MIN_REM = 0.95; // 15.2px

function getAdaptiveLyricFontSize(text: string): string {
  const length = text.trim().length;

  if (length <= 80) {
    return `clamp(1.4rem, 4.4vw, ${LYRIC_FONT_MAX_REM}rem)`;
  }

  if (length <= 180) {
    return "clamp(1.2rem, 3.6vw, 2rem)";
  }

  if (length <= 320) {
    return "clamp(1rem, 3vw, 1.75rem)";
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
  collapseLyricLineBreaks?: boolean;
  showContourMap?: boolean;
}

function isMaskableLyricChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function maskedGlyph(char: string, index: number) {
  return (
    <span
      key={`mask-${index}`}
      data-testid="segment-lyric-mask-char"
      className="text-transparent underline decoration-2 decoration-slate-500 [text-decoration-skip-ink:none]"
      aria-hidden="true"
    >
      {char}
    </span>
  );
}

function renderLyricWithStableMask(text: string, mode: "full" | "hint" | "hidden"): React.ReactNode {
  if (mode === "full") {
    return text;
  }

  let atWordStart = true;

  return Array.from(text).map((char, index) => {
    const isWhitespace = /\s/u.test(char);
    if (isWhitespace) {
      atWordStart = true;
      return <React.Fragment key={`space-${index}`}>{char}</React.Fragment>;
    }

    const canMask = isMaskableLyricChar(char);
    const showChar = mode === "hint" && canMask && atWordStart;
    atWordStart = false;

    if (!canMask || showChar) {
      return <React.Fragment key={`char-${index}`}>{char}</React.Fragment>;
    }

    return maskedGlyph(char, index);
  });
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
  lyricVisibilityMode = "full",
  collapseLyricLineBreaks = false,
  showContourMap = false,
}) => {
  const lyricText = React.useMemo(() => {
    const base = segment.lyricText ?? "";
    if (!collapseLyricLineBreaks) {
      return base;
    }

    return base.replace(/\r?\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  }, [collapseLyricLineBreaks, segment.lyricText]);

  const hasLyrics = lyricText.trim().length > 0;
  const lyricFontSize = React.useMemo(
    () => getAdaptiveLyricFontSize(lyricText),
    [lyricText]
  );
  const displayLyricContent = React.useMemo(() => {
    if (!hasLyrics) {
      return "No lyrics for this segment yet.";
    }
    return renderLyricWithStableMask(lyricText, lyricVisibilityMode);
  }, [hasLyrics, lyricText, lyricVisibilityMode]);

  const clampedPlaybackMs = Math.min(
    segment.endMs,
    Math.max(segment.startMs, playbackMs ?? segment.startMs)
  );
  const durationMs = Math.max(1, segment.endMs - segment.startMs);
  const progress = Math.min(1, Math.max(0, (clampedPlaybackMs - segment.startMs) / durationMs));
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
      <div className="mb-3">
        <p className="text-center text-sm text-gray-500" data-testid="segment-label-text">
          {segment.label}
        </p>
      </div>
      <div className="mb-4 min-h-0 flex-1">
        <div
          className="h-full overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full"
          data-testid="segment-lyric-scroll-container"
        >
          <p
            data-testid="segment-lyric-text"
            className={`whitespace-pre-wrap text-center ${hasLyrics ? "text-slate-700" : "text-gray-400"}`}
            style={{ fontSize: lyricFontSize, lineHeight: 1.4 }}
          >
            {displayLyricContent}
          </p>
        </div>
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
          <span data-testid="segment-start-time">{formatMs(clampedPlaybackMs)}</span>
          <span data-testid="segment-end-time">{formatMs(segment.endMs)}</span>
        </div>
      </div>

      {showContourMap ? (
        <div className="mb-3" data-testid="segment-card-contour-map">
          <PitchContourThumbnail
            notes={segment.pitchContourNotes ?? []}
            segmentDurationMs={Math.max(1, segment.endMs - segment.startMs)}
          />
        </div>
      ) : null}

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
