"use client";

import React from "react";
import { MemoryRating } from "../types/index";
import { getMasteryColor, getMasteryTextColor } from "../lib/masteryColors";

interface RatingBarProps {
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  disabled?: boolean;
}

const RATINGS: MemoryRating[] = [1, 2, 3, 4, 5];
const EMPTY_RATING_STYLE = "bg-indigo-50 text-indigo-700 hover:bg-indigo-100";

const RatingBar: React.FC<RatingBarProps> = ({
  currentRating,
  onRate,
  disabled = false,
}) => {
  return (
    <div className="flex justify-center gap-1.5 sm:gap-2">
      {RATINGS.map((rating) => {
        const isExactSelection = currentRating === rating;
        const isFilled = currentRating !== undefined && rating <= currentRating;
        const masteryPercent = rating * 20;

        return (
        <button
          key={rating}
          data-testid={`rating-button-${rating}`}
          onClick={() => onRate(rating)}
          disabled={disabled}
          aria-label={`Rate ${rating}`}
          aria-pressed={isExactSelection ? "true" : "false"}
          style={isFilled ? {
            backgroundColor: getMasteryColor(masteryPercent),
            color: getMasteryTextColor(masteryPercent),
          } : undefined}
          className={[
            "h-9 w-9 rounded-full text-[13px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 sm:h-10 sm:w-10 sm:text-sm",
            isFilled ? "" : EMPTY_RATING_STYLE,
            isExactSelection ? "shadow-sm ring-2 ring-indigo-300 ring-offset-2" : "",
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
