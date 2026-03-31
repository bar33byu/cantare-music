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
  onSessionChange?: (session: SessionState) => void;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession, onSessionChange }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const loadRatings = async () => {
      setRatingsLoading(true);
      setRatingsError(null);
      try {
        const response = await fetch(`/api/songs/${song.id}/ratings`);
        if (!response.ok) {
          throw new Error(`Failed to load ratings (${response.status})`);
        }

        const payload = await response.json() as { ratings?: SessionState['ratings'] };
        if (!cancelled) {
          dispatch({ type: 'LOAD_RATINGS', ratings: Array.isArray(payload.ratings) ? payload.ratings : [] });
        }
      } catch {
        if (!cancelled) {
          setRatingsError('Could not load previous ratings. Practice is still available.');
        }
      } finally {
        if (!cancelled) {
          setRatingsLoading(false);
        }
      }
    };

    void loadRatings();

    return () => {
      cancelled = true;
    };
  }, [song.id]);

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

  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  return (
    <div
      data-testid="practice-layout"
      className="flex h-screen flex-col bg-gray-50"
    >
      <header data-testid="practice-header" className="px-4 pb-2 pt-4 md:px-8">
        <h1 className="text-xl font-semibold text-gray-900" data-testid="song-title">
          {song.title}
        </h1>
        <p className="text-sm text-gray-500" data-testid="segment-counter">
          {hasSegments
            ? `Segment ${session.currentSegmentIndex + 1} of ${song.segments.length}`
            : "Full piece playback"}
        </p>
      </header>

      <div className="px-4 md:px-8" data-testid="practice-top-bar">
        {ratingsLoading ? (
          <div
            data-testid="ratings-loading-skeleton"
            className="h-8 w-full animate-pulse rounded-full bg-gray-200"
          />
        ) : (
          <KnowledgeBar percent={knowledgeScore.overall} label="Piece Knowledge" />
        )}
        {ratingsError ? (
          <p data-testid="ratings-load-error" className="mt-2 text-sm text-amber-700">
            {ratingsError}
          </p>
        ) : null}
      </div>

      <main data-testid="practice-main" className="flex flex-1 items-center justify-center px-4 pb-6 pt-2 md:px-8">
        <section data-testid="practice-focus" className="flex w-full items-center justify-center gap-4 md:gap-8">
          {hasSegments ? (
            <button
              data-testid="prev-btn"
              aria-label="Previous segment"
              disabled={isFirst}
              onClick={() => jumpToSegment(session.currentSegmentIndex - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300 bg-white text-2xl text-indigo-700 shadow-sm disabled:opacity-40"
            >
              &lt;
            </button>
          ) : null}

          <div className="w-full max-w-md">
            {hasSegments && currentSegment ? (
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
            ) : (
              <div
                data-testid="no-segments"
                className="rounded-[28px] border border-dashed border-indigo-200 bg-white/90 px-6 py-10 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-gray-900">No practice sections yet</p>
                <p className="mt-2 text-sm text-gray-500">
                  You can still play the full recording below, then switch to Edit Song when you are ready to mark sections.
                </p>
              </div>
            )}
          </div>

          {hasSegments ? (
            <button
              data-testid="next-btn"
              aria-label="Next segment"
              disabled={isLast}
              onClick={() => jumpToSegment(session.currentSegmentIndex + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300 bg-white text-2xl text-indigo-700 shadow-sm disabled:opacity-40"
            >
              &gt;
            </button>
          ) : null}
        </section>
      </main>

      <section data-testid="practice-transport" className="border-t border-gray-200 bg-white px-4 py-4 md:px-8">
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
  );
};

export default PracticeView;
