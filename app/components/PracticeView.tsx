"use client";

import React, { useReducer } from "react";
import { Song, PracticeSession, MemoryRating } from "../types/index";
import { sessionReducer } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";

interface PracticeViewProps {
  song: Song;
  initialSession: PracticeSession;
}

const PracticeView: React.FC<PracticeViewProps> = ({ song, initialSession }) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

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
    <div>
      <h1 className="text-2xl font-bold" data-testid="song-title">
        {song.title}
      </h1>
      <p data-testid="segment-counter">
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
      <div className="flex gap-4 mt-4">
        <button
          data-testid="prev-btn"
          disabled={isFirst}
          onClick={() => dispatch({ type: "PREV_SEGMENT" })}
        >
          Previous
        </button>
        <button
          data-testid="next-btn"
          disabled={isLast}
          onClick={() => dispatch({ type: "NEXT_SEGMENT" })}
        >
          Next
        </button>
      </div>
      <KnowledgeBar percent={knowledgeScore.overall} label="Overall Knowledge" />
    </div>
  );
};

export default PracticeView;
