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
        className="relative h-4 w-full overflow-hidden rounded border border-indigo-200 bg-indigo-50"
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-4 rounded bg-indigo-700 transition-all"
          style={{ width: `${clampedPercent}%` }}
          data-testid="knowledge-bar-fill"
        />
        <span
          data-testid="knowledge-bar-percent"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-indigo-950"
        >
          <span className="rounded px-1.5 py-px text-indigo-950 ring-1 ring-indigo-200/80 backdrop-blur-[1px] bg-white/80">
            {Math.round(clampedPercent)}% memorized
          </span>
        </span>
      </div>
    </div>
  );
};

export default KnowledgeBar;
