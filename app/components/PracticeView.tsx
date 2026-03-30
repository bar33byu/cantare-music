"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { Song, MemoryRating } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

interface PracticeViewProps {
  song: Song;
  initialSession: SessionState;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const { isPlaying, isReady, currentMs, durationMs, play, pause, seek } = useAudioPlayer(song.audioUrl);

  if (song.segments.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500" data-testid="no-segments">
        This song has no segments yet. Add some to start practicing!
      </div>
    );
  }

  const currentSegment = song.segments[session.currentSegmentIndex];
  const isLast = session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = session.currentSegmentIndex === 0;
  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs));

  useEffect(() => {
    if (!song.audioUrl) {
      return;
    }
    pause();
    seek(currentSegment.startMs);
  }, [currentSegment.startMs, song.audioUrl, pause, seek]);

  const playbackSegmentIndex = useMemo(() => {
    const byPlayback = song.segments.findIndex(
      (segment) => currentMs >= segment.startMs && currentMs < segment.endMs
    );
    return byPlayback === -1 ? session.currentSegmentIndex : byPlayback;
  }, [currentMs, session.currentSegmentIndex, song.segments]);

  const currentRating: MemoryRating | undefined = (() => {
    const segRatings = session.ratings
      .filter((rating) => rating.segmentId === currentSegment.id)
      .sort((a, b) => (a.ratedAt > b.ratedAt ? -1 : 1));
    return segRatings.length > 0 ? segRatings[0].rating : undefined;
  })();

  const knowledgeScore = computeKnowledgeScore(session, song);

  const jumpToSegment = (targetIndex: number) => {
    const clamped = Math.max(0, Math.min(song.segments.length - 1, targetIndex));
    const targetSegment = song.segments[clamped];
    dispatch({ type: "SET_SEGMENT_INDEX", index: clamped });
    if (isPlaying) {
      play(targetSegment.startMs, targetSegment.endMs);
      return;
    }
    seek(targetSegment.startMs);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
      return;
    }

    const resumeMs =
      currentMs >= currentSegment.startMs && currentMs < currentSegment.endMs
        ? currentMs
        : currentSegment.startMs;
    play(resumeMs, currentSegment.endMs);
  };

  const handleRestartSegment = () => {
    seek(currentSegment.startMs);
    play(currentSegment.startMs, currentSegment.endMs);
  };

  const handleSeekSong = (ms: number) => {
    seek(ms);
    const targetIndex = song.segments.findIndex(
      (segment) => ms >= segment.startMs && ms < segment.endMs
    );
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  };

  return (
    <div
      data-testid="practice-layout"
      className="mx-auto w-full max-w-6xl rounded-[32px] border border-gray-200 bg-gradient-to-b from-white to-indigo-50/30 p-4 shadow-sm md:p-6"
    >
      <header data-testid="practice-header" className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="song-title">
            {song.title}
          </h1>
          <p className="text-sm text-gray-500" data-testid="segment-counter">
            Segment {session.currentSegmentIndex + 1} of {song.segments.length}
          </p>
        </div>
      </header>

      <div className="mb-8" data-testid="practice-top-bar">
        <KnowledgeBar percent={knowledgeScore.overall} label="Piece Knowledge" />
      </div>

      <div data-testid="practice-main" className="space-y-8">
        <section
          data-testid="practice-focus"
          className="flex items-center justify-center gap-4 md:gap-10"
        >
          <button
            data-testid="prev-btn"
            disabled={isFirst}
            onClick={() => jumpToSegment(session.currentSegmentIndex - 1)}
            className="h-16 w-16 rounded-full border border-indigo-200 bg-white text-3xl text-indigo-600 shadow-sm disabled:opacity-40"
          >
            &lt;
          </button>

          <div className="w-full max-w-xl">
            <div className="mb-4 flex flex-wrap justify-center gap-2" data-testid="practice-segment-strip">
              {song.segments.map((segment, index) => {
                const isActive = index === session.currentSegmentIndex;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    data-testid={`jump-segment-${segment.id}`}
                    onClick={() => jumpToSegment(index)}
                    className={[
                      "rounded-full px-3 py-1 text-sm transition-colors",
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {segment.label}
                  </button>
                );
              })}
            </div>

            <SegmentCard
              segment={currentSegment}
              currentRating={currentRating}
              onRate={(rating) =>
                dispatch({ type: "RATE_SEGMENT", segmentId: currentSegment.id, rating })
              }
              isLocked={session.isLocked}
              onToggleLock={() => dispatch({ type: "TOGGLE_LOCK" })}
              playbackMs={currentMs}
              onSeek={seek}
            />
          </div>

          <button
            data-testid="next-btn"
            disabled={isLast}
            onClick={() => jumpToSegment(session.currentSegmentIndex + 1)}
            className="h-16 w-16 rounded-full border border-indigo-200 bg-white text-3xl text-indigo-600 shadow-sm disabled:opacity-40"
          >
            &gt;
          </button>
        </section>

        <section data-testid="practice-queue" className="rounded-2xl border border-indigo-100 bg-white/80 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            {song.segments.map((segment, index) => {
              const isActive = index === playbackSegmentIndex;
              return (
                <div
                  key={segment.id}
                  data-testid={`queue-segment-${segment.id}`}
                  data-highlighted={isActive ? "true" : "false"}
                  className={[
                    "rounded-xl border px-4 py-3 text-left transition-colors",
                    isActive
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-gray-200 bg-white text-gray-700",
                  ].join(" ")}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Section {index + 1}
                  </p>
                  <p className="mt-1 font-medium">{segment.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section data-testid="practice-transport">
          <AudioPlayer
            audioUrl={song.audioUrl}
            currentMs={currentMs}
            durationMs={totalDurationMs}
            segmentStartMs={currentSegment.startMs}
            segmentEndMs={currentSegment.endMs}
            isPlaying={isPlaying}
            isReady={isReady}
            onPlayPause={handleTogglePlay}
            onRestartSegment={handleRestartSegment}
            onSeekSong={handleSeekSong}
          />
        </section>
      </div>
    </div>
  );
};

export default PracticeView;
