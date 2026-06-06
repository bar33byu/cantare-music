"use client";

import React from "react";

interface KnowledgeBarProps {
  percent: number;
  label?: string;
}

const KnowledgeBar: React.FC<KnowledgeBarProps> = ({ percent, label }) => {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const roundedPercent = Math.round(clampedPercent);
  const labelInFill = clampedPercent >= 50;
  const labelOffset = labelInFill ? "calc(-100% - 4px)" : "4px";

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
        className="relative h-4 w-full overflow-hidden rounded border border-indigo-200 bg-white"
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full bg-indigo-700 transition-all ${clampedPercent >= 100 ? "rounded" : "rounded-l"}`}
          style={{ width: `${clampedPercent}%` }}
          data-testid="knowledge-bar-fill"
        />
        <span
          data-testid="knowledge-bar-percent"
          className={`pointer-events-none absolute top-1/2 whitespace-nowrap text-[11px] font-semibold leading-none ${labelInFill ? "text-white" : "text-indigo-950"}`}
          style={{
            left: `${clampedPercent}%`,
            transform: `translate(${labelOffset}, -50%)`,
          }}
        >
          {roundedPercent}% memorized
        </span>
      </div>
    </div>
  );
};

export default KnowledgeBar;
