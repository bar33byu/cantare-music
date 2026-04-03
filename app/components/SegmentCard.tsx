"use client";

import React from "react";
import { Segment, MemoryRating } from "../types/index";
import RatingBar from "./RatingBar";
import { getMasteryColor } from "../lib/masteryColors";

const LYRIC_FONT_MAX_REM = 2.25; // 36px
const LYRIC_FONT_MIN_REM = 1; // 16px
const LYRIC_FONT_STEP_REM = 0.05;

function getAdaptiveLyricFontSize(text: string): number {
  const length = text.trim().length;

  if (length <= 80) {
    return LYRIC_FONT_MAX_REM;
  }

  if (length <= 180) {
    return 2;
  }

  if (length <= 320) {
    return 1.75;
  }

  return 1.5;
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
  const lyricViewportRef = React.useRef<HTMLDivElement | null>(null);
  const lyricTextRef = React.useRef<HTMLParagraphElement | null>(null);
  const hasLyrics = (segment.lyricText ?? "").trim().length > 0;
  const preferredLyricFontSize = React.useMemo(
    () => getAdaptiveLyricFontSize(segment.lyricText || ""),
    [segment.lyricText]
  );
  const [lyricFontSizeRem, setLyricFontSizeRem] = React.useState(preferredLyricFontSize);
  const [hasOverflowAbove, setHasOverflowAbove] = React.useState(false);
  const [hasOverflowBelow, setHasOverflowBelow] = React.useState(false);
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

  const updateOverflowHint = React.useCallback(() => {
    const viewport = lyricViewportRef.current;
    if (!viewport) {
      setHasOverflowAbove(false);
      setHasOverflowBelow(false);
      return;
    }

    const canScroll = viewport.scrollHeight > viewport.clientHeight + 1;
    if (!canScroll) {
      setHasOverflowAbove(false);
      setHasOverflowBelow(false);
      return;
    }

    setHasOverflowAbove(viewport.scrollTop > 1);
    setHasOverflowBelow(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1);
  }, []);

  const fitLyricsToViewport = React.useCallback(() => {
    const viewport = lyricViewportRef.current;
    const lyricText = lyricTextRef.current;
    if (!viewport || !lyricText || typeof window === "undefined") {
      return;
    }

    let nextFontSizeRem = preferredLyricFontSize;
    lyricText.style.fontSize = `${nextFontSizeRem}rem`;

    while (nextFontSizeRem > LYRIC_FONT_MIN_REM && viewport.scrollHeight > viewport.clientHeight + 1) {
      nextFontSizeRem = Math.max(
        LYRIC_FONT_MIN_REM,
        Number((nextFontSizeRem - LYRIC_FONT_STEP_REM).toFixed(2))
      );
      lyricText.style.fontSize = `${nextFontSizeRem}rem`;
    }

    setLyricFontSizeRem((current) => (Math.abs(current - nextFontSizeRem) < 0.01 ? current : nextFontSizeRem));
    updateOverflowHint();
  }, [preferredLyricFontSize, updateOverflowHint]);

  React.useEffect(() => {
    setLyricFontSizeRem(preferredLyricFontSize);
  }, [preferredLyricFontSize]);

  React.useEffect(() => {
    fitLyricsToViewport();

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("resize", fitLyricsToViewport);

    if (typeof window.ResizeObserver === "undefined" || !lyricViewportRef.current) {
      return () => {
        window.removeEventListener("resize", fitLyricsToViewport);
      };
    }

    const observer = new window.ResizeObserver(() => {
      fitLyricsToViewport();
    });

    observer.observe(lyricViewportRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitLyricsToViewport);
    };
  }, [displayLyricText, fitLyricsToViewport]);

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
      <div className="relative mb-4 min-h-0 flex-1">
        <div
          ref={lyricViewportRef}
          data-testid="segment-lyric-viewport"
          className="h-full overflow-y-auto pr-2"
          onScroll={updateOverflowHint}
        >
          <p
            ref={lyricTextRef}
            data-testid="segment-lyric-text"
            className={`pb-8 text-center ${hasLyrics && lyricVisibilityMode !== "hidden" ? "text-slate-700" : "text-gray-400"}`}
            style={{ fontSize: `${lyricFontSizeRem}rem`, lineHeight: 1.4 }}
          >
            {displayLyricText}
          </p>
        </div>
        <div
          aria-hidden="true"
          data-testid="segment-lyric-top-hint"
          className={`pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white via-white/80 to-transparent transition-opacity duration-200 ${hasOverflowAbove ? "opacity-100" : "opacity-0"}`}
        />
        <div
          aria-hidden="true"
          data-testid="segment-lyric-bottom-hint"
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-1 transition-opacity duration-200 ${hasOverflowBelow ? "opacity-100" : "opacity-0"}`}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-indigo-200/80 bg-white/90 text-indigo-500 shadow-sm md:hidden">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
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
