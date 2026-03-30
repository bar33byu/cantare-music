"use client";

import { DragEvent } from 'react';
import { Segment } from '../types/index';

interface DraggableSegmentCardProps {
  segment: Segment;
  isDragging?: boolean;
  isDragOver?: boolean;
  onEdit?: (segment: Segment) => void;
  onDelete?: (segment: Segment) => void;
  /** HTML5 drag-and-drop handlers — wired up in prompt 7 */
  onDragStart?: (e: DragEvent<HTMLLIElement>, segment: Segment) => void;
  onDragOver?: (e: DragEvent<HTMLLIElement>, segment: Segment) => void;
  onDrop?: (e: DragEvent<HTMLLIElement>, segment: Segment) => void;
  onDragEnd?: (e: DragEvent<HTMLLIElement>) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function DraggableSegmentCard({
  segment,
  isDragging = false,
  isDragOver = false,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver: handleDragOver,
  onDrop,
  onDragEnd,
}: DraggableSegmentCardProps) {
  return (
    <li
      draggable
      data-testid={`draggable-card-${segment.id}`}
      aria-label={`Segment: ${segment.label}`}
      onDragStart={(e) => onDragStart?.(e, segment)}
      onDragOver={(e) => {
        e.preventDefault();
        handleDragOver?.(e, segment);
      }}
      onDrop={(e) => onDrop?.(e, segment)}
      onDragEnd={(e) => onDragEnd?.(e)}
      className={[
        'flex items-start gap-3 rounded-lg border bg-white p-4 shadow-sm transition-opacity select-none',
        isDragging ? 'opacity-40' : 'opacity-100',
        isDragOver ? 'border-blue-400 ring-2 ring-blue-300' : 'border-gray-200',
      ].join(' ')}
    >
      {/* Drag handle */}
      <div
        data-testid={`drag-handle-${segment.id}`}
        aria-hidden="true"
        className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        {/* Grip icon — 6 dots */}
        <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="4"  r="1.5" />
          <circle cx="9" cy="4"  r="1.5" />
          <circle cx="3" cy="10" r="1.5" />
          <circle cx="9" cy="10" r="1.5" />
          <circle cx="3" cy="16" r="1.5" />
          <circle cx="9" cy="16" r="1.5" />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span
            data-testid={`card-order-${segment.id}`}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center"
          >
            {segment.order}
          </span>
          <span
            data-testid={`card-label-${segment.id}`}
            className="font-semibold text-gray-800 truncate"
          >
            {segment.label}
          </span>
        </div>
        <div className="mt-1 ml-10 text-sm text-gray-500">
          <span data-testid={`card-time-${segment.id}`}>
            {formatMs(segment.startMs)} – {formatMs(segment.endMs)}
          </span>
        </div>
        {segment.lyricText && (
          <p
            data-testid={`card-lyrics-${segment.id}`}
            className="mt-2 ml-10 text-sm text-gray-600 line-clamp-2"
          >
            {segment.lyricText}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {onEdit && (
          <button
            onClick={() => onEdit(segment)}
            data-testid={`card-edit-${segment.id}`}
            className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(segment)}
            data-testid={`card-delete-${segment.id}`}
            className="px-3 py-1 text-sm border border-red-300 rounded text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
