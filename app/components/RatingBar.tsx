"use client";

import React from "react";
import { MemoryRating } from "../types/index";

interface RatingBarProps {
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  disabled?: boolean;
}

const RATINGS: MemoryRating[] = [1, 2, 3, 4, 5];

const RatingBar: React.FC<RatingBarProps> = ({
  currentRating,
  onRate,
  disabled = false,
}) => {
  return (
    <div className="flex gap-2 justify-center">
      {RATINGS.map((rating) => {
        const isExactSelection = currentRating === rating;
        const isFilled = currentRating !== undefined && rating <= currentRating;

        return (
        <button
          key={rating}
          data-testid={`rating-button-${rating}`}
          onClick={() => onRate(rating)}
          disabled={disabled}
          aria-label={`Rate ${rating}`}
          aria-pressed={isExactSelection ? "true" : "false"}
          className={[
            "w-10 h-10 rounded-full text-sm font-semibold transition-colors",
            isFilled
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-indigo-100",
            disabled ? "opacity-40 cursor-not-allowed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {rating}
        </button>
        );
      })}
    </div>
  );
};

export default RatingBar;