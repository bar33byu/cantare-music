"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { Song, MemoryRating } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { toPlayableAudioUrl } from "../lib/audioUrls";

interface TransportDebugState {
  playToggleClicks: number;
  restartClicks: number;
  seekClicks: number;
  debugPlayTestClicks: number;
  lastAction: string;
  lastActionAt: string;
}

interface PracticeViewProps {
  song: Song;
  initialSession: SessionState;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const playbackAudioUrl = useMemo(() => toPlayableAudioUrl(song.audioUrl), [song.audioUrl]);
  const { isPlaying, isReady, currentMs, durationMs, playbackError, debugInfo, play, pause, seek } = useAudioPlayer(playbackAudioUrl);
  const [transportDebug, setTransportDebug] = React.useState<TransportDebugState>({
    playToggleClicks: 0,
    restartClicks: 0,
    seekClicks: 0,
    debugPlayTestClicks: 0,
    lastAction: "init",
    lastActionAt: new Date().toISOString(),
  });
  const hasSegments = song.segments.length > 0;
  const currentSegment = hasSegments ? song.segments[session.currentSegmentIndex] : null;
  const isLast = !hasSegments || session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = !hasSegments || session.currentSegmentIndex === 0;
  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs), 0);
  const activeStartMs = currentSegment?.startMs ?? 0;
  const activeEndMs = currentSegment?.endMs ?? totalDurationMs;

  useEffect(() => {
    if (!song.audioUrl || !currentSegment) {
      return;
    }
    pause();
    seek(currentSegment.startMs);
  }, [currentSegment, song.audioUrl, pause, seek]);

  const playbackSegmentIndex = useMemo(() => {
    if (!hasSegments) {
      return -1;
    }
    const byPlayback = song.segments.findIndex(
      (segment) => currentMs >= segment.startMs && currentMs < segment.endMs
    );
    return byPlayback === -1 ? session.currentSegmentIndex : byPlayback;
  }, [currentMs, hasSegments, session.currentSegmentIndex, song.segments]);

  const currentRating: MemoryRating | undefined = (() => {
    if (!currentSegment) {
      return undefined;
    }
    const segRatings = session.ratings
      .filter((rating) => rating.segmentId === currentSegment.id)
      .sort((a, b) => (a.ratedAt > b.ratedAt ? -1 : 1));
    return segRatings.length > 0 ? segRatings[0].rating : undefined;
  })();

  const knowledgeScore = computeKnowledgeScore(session, song);

  const jumpToSegment = (targetIndex: number) => {
    if (!hasSegments) {
      return;
    }
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
    setTransportDebug((previous) => ({
      ...previous,
      playToggleClicks: previous.playToggleClicks + 1,
      lastAction: "toggle-play",
      lastActionAt: new Date().toISOString(),
    }));
    if (isPlaying) {
      pause();
      return;
    }

    // Main play button should drive full-piece playback.
    const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
    const fullPieceResumeMs = durationMs > 0 && currentMs >= durationMs ? 0 : currentMs;
    play(fullPieceResumeMs, effectiveDurationMs);
  };

  const handleRestartSegment = () => {
    setTransportDebug((previous) => ({
      ...previous,
      restartClicks: previous.restartClicks + 1,
      lastAction: "restart-segment",
      lastActionAt: new Date().toISOString(),
    }));
    const restartMs = currentSegment?.startMs ?? 0;
    const endMs = currentSegment?.endMs ?? (totalDurationMs || Number.POSITIVE_INFINITY);
    seek(restartMs);
    play(restartMs, endMs);
  };

  const handleSeekSong = (ms: number) => {
    setTransportDebug((previous) => ({
      ...previous,
      seekClicks: previous.seekClicks + 1,
      lastAction: `seek-song-${ms}`,
      lastActionAt: new Date().toISOString(),
    }));
    seek(ms);
    const targetIndex = song.segments.findIndex(
      (segment) => ms >= segment.startMs && ms < segment.endMs
    );
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  };

  const handleDebugPlayTest = () => {
    setTransportDebug((previous) => ({
      ...previous,
      debugPlayTestClicks: previous.debugPlayTestClicks + 1,
      lastAction: "debug-play-test",
      lastActionAt: new Date().toISOString(),
    }));
    play(0, 10000);
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
            {hasSegments
              ? `Segment ${session.currentSegmentIndex + 1} of ${song.segments.length}`
              : "Full piece playback"}
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
          {hasSegments ? (
            <button
              data-testid="prev-btn"
              disabled={isFirst}
              onClick={() => jumpToSegment(session.currentSegmentIndex - 1)}
              className="h-16 w-16 rounded-full border border-indigo-200 bg-white text-3xl text-indigo-600 shadow-sm disabled:opacity-40"
            >
              &lt;
            </button>
          ) : null}

          <div className="w-full max-w-xl">
            {hasSegments && currentSegment ? (
              <>
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
                  playbackMs={currentMs}
                  onSeek={seek}
                />
              </>
            ) : (
              <div
                data-testid="no-segments"
                className="rounded-[28px] border border-dashed border-indigo-200 bg-white/90 px-6 py-10 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-gray-900">No practice segments yet</p>
                <p className="mt-2 text-sm text-gray-500">
                  You can still play the full recording below, then switch to Edit Segments when you are ready to mark sections.
                </p>
              </div>
            )}
          </div>

          {hasSegments ? (
            <button
              data-testid="next-btn"
              disabled={isLast}
              onClick={() => jumpToSegment(session.currentSegmentIndex + 1)}
              className="h-16 w-16 rounded-full border border-indigo-200 bg-white text-3xl text-indigo-600 shadow-sm disabled:opacity-40"
            >
              &gt;
            </button>
          ) : null}
        </section>

        <section data-testid="practice-queue" className="rounded-2xl border border-indigo-100 bg-white/80 p-4">
          {hasSegments ? (
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
          ) : (
            <div data-testid="no-segments-queue" className="text-sm text-gray-500">
              Segment highlights will appear here after you create practice sections.
            </div>
          )}
        </section>

        <section data-testid="practice-transport">
          <AudioPlayer
            audioUrl={song.audioUrl}
            currentMs={currentMs}
            durationMs={totalDurationMs}
            segmentStartMs={activeStartMs}
            segmentEndMs={activeEndMs}
            isPlaying={isPlaying}
            isReady={isReady}
            playbackError={playbackError}
            debugInfo={debugInfo}
            restartLabel={hasSegments ? "Restart Segment" : "Restart Piece"}
            transportDebug={transportDebug}
            onPlayPause={handleTogglePlay}
            onRestartSegment={handleRestartSegment}
            onSeekSong={handleSeekSong}
            onDebugPlayTest={handleDebugPlayTest}
          />
        </section>
      </div>
    </div>
  );
};

export default PracticeView;
