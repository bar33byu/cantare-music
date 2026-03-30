"use client";

import React, { useReducer } from "react";
import { Song, PracticeSession, MemoryRating } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";

interface PracticeViewProps {
  song: Song;
  initialSession: SessionState;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

  if (song.segments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500" data-testid="no-segments">
        This song has no segments yet. Add some to start practicing!
      </div>
    );
  }

  const currentSegment = song.segments[session.currentSegmentIndex];

  const currentRating: MemoryRating | undefined = (() => {
    const segRatings = session.ratings
      .filter((r) => r.segmentId === currentSegment.id)
      .sort((a, b) => (a.ratedAt > b.ratedAt ? -1 : 1));
    return segRatings.length > 0 ? segRatings[0].rating : undefined;
  })();

  const knowledgeScore = computeKnowledgeScore(session, song);

  const isLast = session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = session.currentSegmentIndex === 0;

  return (
    <div className="max-w-lg mx-auto w-full flex flex-col gap-6 p-4">
      <h1 className="text-3xl font-bold text-center text-gray-900" data-testid="song-title">
        {song.title}
      </h1>
      <p className="text-center text-sm text-gray-500" data-testid="segment-counter">
        {session.currentSegmentIndex + 1} / {song.segments.length}
      </p>
      <SegmentCard
        segment={currentSegment}
        currentRating={currentRating}
        onRate={(rating) =>
          dispatch({ type: "RATE_SEGMENT", segmentId: currentSegment.id, rating })
        }
        isLocked={session.isLocked}
        onToggleLock={() => dispatch({ type: "TOGGLE_LOCK" })}
      />
      <div className="flex justify-between">
        <button
          data-testid="prev-btn"
          disabled={isFirst}
          onClick={() => dispatch({ type: "PREV_SEGMENT" })}
          className="px-6 py-2 rounded-full bg-indigo-600 text-white disabled:opacity-40"
        >
          Previous
        </button>
        <button
          data-testid="next-btn"
          disabled={isLast}
          onClick={() => dispatch({ type: "NEXT_SEGMENT" })}
          className="px-6 py-2 rounded-full bg-indigo-600 text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
      <KnowledgeBar percent={knowledgeScore.overall} label="Overall Knowledge" />
    </div>
  );
};

export default PracticeView;
