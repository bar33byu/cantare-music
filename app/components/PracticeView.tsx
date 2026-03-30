"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Song, MemoryRating } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";

interface PracticeViewProps {
  song: Song;
  initialSession: SessionState;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [playbackMs, setPlaybackMs] = useState<number>(0);

  const jumpToSegment = (targetIndex: number) => {
    const clamped = Math.max(0, Math.min(song.segments.length - 1, targetIndex));
    dispatch({ type: "SET_SEGMENT_INDEX", index: clamped });
  };

  if (song.segments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500" data-testid="no-segments">
        This song has no segments yet. Add some to start practicing!
      </div>
    );
  }

  const currentSegment = song.segments[session.currentSegmentIndex];

  useEffect(() => {
    setPlaybackMs(currentSegment.startMs);
  }, [currentSegment.startMs]);

  const currentRating: MemoryRating | undefined = (() => {
    const segRatings = session.ratings
      .filter((r) => r.segmentId === currentSegment.id)
      .sort((a, b) => (a.ratedAt > b.ratedAt ? -1 : 1));
    return segRatings.length > 0 ? segRatings[0].rating : undefined;
  })();

  const knowledgeScore = computeKnowledgeScore(session, song);

  const isLast = session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = session.currentSegmentIndex === 0;
  const highlightedSegmentIndex = useMemo(() => {
    const byPlayback = song.segments.findIndex(
      (segment) => playbackMs >= segment.startMs && playbackMs < segment.endMs
    );
    return byPlayback === -1 ? session.currentSegmentIndex : byPlayback;
  }, [playbackMs, session.currentSegmentIndex, song.segments]);

  const previousSegment =
    highlightedSegmentIndex > 0 ? song.segments[highlightedSegmentIndex - 1] : null;
  const highlightedSegment = song.segments[highlightedSegmentIndex];
  const nextSegment =
    highlightedSegmentIndex < song.segments.length - 1
      ? song.segments[highlightedSegmentIndex + 1]
      : null;

  return (
    <div
      data-testid="practice-layout"
      className="mx-auto w-full max-w-6xl rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-6"
    >
      <header
        data-testid="practice-header"
        className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 pb-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="song-title">
            {song.title}
          </h1>
          <p className="text-sm text-gray-500" data-testid="segment-counter">
            Segment {session.currentSegmentIndex + 1} of {song.segments.length}
          </p>
        </div>
        <div className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
          Practice Mode
        </div>
      </header>

      <div data-testid="practice-main" className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section data-testid="practice-focus" className="space-y-5">
          <SegmentCard
            segment={currentSegment}
            currentRating={currentRating}
            onRate={(rating) =>
              dispatch({ type: "RATE_SEGMENT", segmentId: currentSegment.id, rating })
            }
            isLocked={session.isLocked}
            onToggleLock={() => dispatch({ type: "TOGGLE_LOCK" })}
          />
          <AudioPlayer
            audioUrl={song.audioUrl}
            startMs={currentSegment.startMs}
            endMs={currentSegment.endMs}
            onTimeChange={setPlaybackMs}
          />
          <div className="flex justify-between gap-3">
            <button
              data-testid="prev-btn"
              disabled={isFirst}
              onClick={() => jumpToSegment(session.currentSegmentIndex - 1)}
              className="flex-1 rounded-full bg-indigo-600 px-6 py-2 text-white disabled:opacity-40"
            >
              Previous
            </button>
            <button
              data-testid="next-btn"
              disabled={isLast}
              onClick={() => jumpToSegment(session.currentSegmentIndex + 1)}
              className="flex-1 rounded-full bg-indigo-600 px-6 py-2 text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <KnowledgeBar percent={knowledgeScore.overall} label="Overall Knowledge" />
        </section>

        <aside
          data-testid="practice-queue"
          className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Segment Queue</h2>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="queue-prev-btn"
                disabled={session.currentSegmentIndex === 0}
                onClick={() => jumpToSegment(session.currentSegmentIndex - 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
              >
                Prev Segment
              </button>
              <button
                type="button"
                data-testid="queue-next-btn"
                disabled={session.currentSegmentIndex === song.segments.length - 1}
                onClick={() => jumpToSegment(session.currentSegmentIndex + 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
              >
                Next Segment
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Previous</p>
              <p data-testid="prev-segment-preview" className="mt-1 text-sm text-gray-800">
                {previousSegment ? previousSegment.label : "Start of song"}
              </p>
            </div>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-medium text-indigo-700">Current</p>
              <p data-testid="current-segment-preview" className="mt-1 font-semibold text-indigo-900">
                {highlightedSegment.label}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Next</p>
              <p data-testid="next-segment-preview" className="mt-1 text-sm text-gray-800">
                {nextSegment ? nextSegment.label : "End of song"}
              </p>
            </div>

            <div className="pt-2">
              <p className="text-xs font-medium text-gray-500">All Segments</p>
              <ul className="mt-2 space-y-2" data-testid="segment-highlight-list">
                {song.segments.map((segment, index) => {
                  const isActive = index === highlightedSegmentIndex;
                  return (
                    <li
                      key={segment.id}
                      data-testid={`queue-segment-${segment.id}`}
                      data-highlighted={isActive ? "true" : "false"}
                    >
                      <button
                        type="button"
                        data-testid={`jump-segment-${segment.id}`}
                        onClick={() => jumpToSegment(index)}
                        className={[
                          "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "border-indigo-400 bg-indigo-100 text-indigo-900"
                            : "border-gray-200 bg-white text-gray-700",
                        ].join(" ")}
                      >
                        {segment.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PracticeView;
