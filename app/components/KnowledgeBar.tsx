"use client";

import React from "react";

interface KnowledgeBarProps {
  percent: number;
  label?: string;
}

const KnowledgeBar: React.FC<KnowledgeBarProps> = ({ percent, label }) => {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full">
      {label && (
        <p
          className="mb-1 text-xs text-gray-700"
          data-testid="knowledge-bar-label"
        >
          {label}
        </p>
      )}
      <div
        className="w-full bg-gray-200 rounded h-3"
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bg-indigo-500 rounded h-3 transition-all"
          style={{ width: `${clampedPercent}%` }}
          data-testid="knowledge-bar-fill"
        />
      </div>
    </div>
  );
};

export default KnowledgeBar;
