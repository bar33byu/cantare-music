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
}

const SegmentCard: React.FC<SegmentCardProps> = ({
  segment,
  currentRating,
  onRate,
  isLocked,
  onToggleLock,
}) => {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-semibold">{segment.label}</h2>
      <button
        aria-label="Toggle lock"
        data-testid="lock-toggle"
        onClick={onToggleLock}
      >
        {isLocked ? "Locked" : "Unlocked"}
      </button>
      <RatingBar
        currentRating={currentRating}
        onRate={onRate}
        disabled={isLocked}
      />
      <KnowledgeBar
        percent={currentRating ? getSegmentKnowledgePercent(currentRating) : 0}
        label="Knowledge"
      />
    </div>
  );
};

export default SegmentCard;
