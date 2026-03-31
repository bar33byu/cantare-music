"use client";

import { useMemo, useRef, useState } from "react";
import { Segment } from "../types";

interface EditState {
  startMs: number;
  endMs: number;
  onChange: (startMs: number, endMs: number) => void;
}

interface SegmentTimelineProps {
  durationMs: number;
  segments: Segment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: Segment) => void;
  editState?: EditState;
}

type DragHandle = "start" | "end" | null;

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SegmentTimeline({
  durationMs,
  segments,
  activeSegmentId,
  onSegmentClick,
  editState,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragHandle>(null);
  const [activePointerId, setActivePointerId] = useState<number | null>(null);

  const plottedSegments = useMemo(() => {
    const byStart = [...segments].sort(
      (a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id)
    );

    return byStart.map((segment, index) => ({
      segment,
      lane: index % 2,
    }));
  }, [segments]);

  const msFromClientX = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || durationMs <= 0) {
      return 0;
    }
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * durationMs);
  };

  const updateDragValue = (clientX: number, pointerId: number) => {
    if (!editState || !activeDrag || durationMs <= 0) {
      return;
    }
    if (activePointerId !== null && pointerId !== activePointerId) {
      return;
    }

    const rawMs = msFromClientX(clientX);
    if (activeDrag === "start") {
      const nextStart = clamp(rawMs, 0, Math.max(0, editState.endMs - 1000));
      editState.onChange(nextStart, editState.endMs);
      return;
    }

    const nextEnd = clamp(rawMs, Math.min(durationMs, editState.startMs + 1000), durationMs);
    editState.onChange(editState.startMs, nextEnd);
  };

  const stopDrag = () => {
    setActiveDrag(null);
    setActivePointerId(null);
  };

  if (durationMs === 0) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
        <div className="h-6 rounded bg-indigo-100" />
        <p className="mt-2 text-center" data-testid="timeline-empty-label">No audio loaded</p>
      </div>
    );
  }

  const editLeftPct = editState ? (editState.startMs / durationMs) * 100 : 0;
  const editWidthPct = editState ? ((editState.endMs - editState.startMs) / durationMs) * 100 : 0;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-testid="segment-timeline"
        className="relative h-16 overflow-hidden rounded-xl border border-indigo-300 bg-indigo-100"
        onPointerMove={(e) => {
          if (!activeDrag) {
            return;
          }
          updateDragValue(e.clientX, e.pointerId);
        }}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {plottedSegments.map(({ segment, lane }) => {
          const left = (segment.startMs / durationMs) * 100;
          const width = Math.max(0.8, ((segment.endMs - segment.startMs) / durationMs) * 100);
          const isActive = segment.id === activeSegmentId;
          return (
            <button
              key={segment.id}
              type="button"
              data-testid={`segment-block-${segment.id}`}
              data-segment-id={segment.id}
              className={[
                "absolute rounded border border-amber-600 bg-amber-300/90 text-left text-xs text-amber-900",
                isActive ? "ring-2 ring-indigo-600" : "",
              ].join(" ")}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                top: lane === 0 ? "0%" : "50%",
                height: "50%",
                zIndex: isActive ? 20 : 10 + lane,
              }}
              onClick={() => onSegmentClick?.(segment)}
            >
              <span className="block truncate px-2 py-1">{segment.label}</span>
            </button>
          );
        })}

        {editState ? (
          <>
            <div
              data-testid="edit-overlay"
              className="pointer-events-none absolute inset-y-0 border-x-2 border-blue-700 bg-blue-300/35"
              style={{ left: `${editLeftPct}%`, width: `${editWidthPct}%` }}
            />
            <button
              type="button"
              data-testid="handle-start"
              aria-label="Drag start"
              className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-col-resize bg-blue-800"
              style={{ left: `${editLeftPct}%` }}
              onPointerDown={(e) => {
                setActiveDrag("start");
                setActivePointerId(e.pointerId);
                if (typeof e.currentTarget.setPointerCapture === "function") {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerUp={(e) => {
                if (typeof e.currentTarget.releasePointerCapture === "function") {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                stopDrag();
              }}
              onPointerCancel={stopDrag}
            />
            <button
              type="button"
              data-testid="handle-end"
              aria-label="Drag end"
              className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-col-resize bg-blue-800"
              style={{ left: `${editLeftPct + editWidthPct}%` }}
              onPointerDown={(e) => {
                setActiveDrag("end");
                setActivePointerId(e.pointerId);
                if (typeof e.currentTarget.setPointerCapture === "function") {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerUp={(e) => {
                if (typeof e.currentTarget.releasePointerCapture === "function") {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                stopDrag();
              }}
              onPointerCancel={stopDrag}
            />
          </>
        ) : null}
      </div>

      {editState ? (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span data-testid="handle-start-label">{formatMs(editState.startMs)}</span>
          <span data-testid="handle-end-label">{formatMs(editState.endMs)}</span>
        </div>
      ) : null}
    </div>
  );
}
