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
    <div className="relative bg-white rounded-2xl shadow-md p-6 max-w-lg w-full mx-auto">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">{segment.label}</h2>
        <button
          aria-label="Toggle lock"
          data-testid="lock-toggle"
          onClick={onToggleLock}
          className="ml-3 flex-shrink-0 text-sm px-3 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          {isLocked ? "Locked" : "Unlocked"}
        </button>
      </div>
      <RatingBar
        currentRating={currentRating}
        onRate={onRate}
        disabled={isLocked}
      />
      <div className="mt-4">
        <KnowledgeBar
          percent={currentRating ? getSegmentKnowledgePercent(currentRating) : 0}
          label="Knowledge"
        />
      </div>
    </div>
  );
};

export default SegmentCard;
