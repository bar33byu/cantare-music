"use client";

import { useState, useEffect, useCallback } from 'react';
import { Segment } from '../types/index';

interface SegmentListProps {
  songId: string;
  onEdit?: (segment: Segment) => void;
  onDelete?: (segment: Segment) => void;
  onAddNew?: () => void;
  /** If provided, the list will refresh when this value changes */
  refreshKey?: number;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function SegmentList({ songId, onEdit, onDelete, onAddNew, refreshKey }: SegmentListProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/songs/${songId}/segments`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || 'Failed to load segments');
      }
      const data: Segment[] = await response.json();
      // Sort by order
      setSegments(data.sort((a, b) => a.order - b.order));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments, refreshKey]);

  const handleDelete = async (segment: Segment) => {
    if (!onDelete) return;
    onDelete(segment);
  };

  if (loading) {
    return (
      <div data-testid="segment-list-loading" className="py-8 text-center text-gray-500">
        Loading segments...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="segment-list-error" role="alert" className="py-4 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div data-testid="segment-list">
      {segments.length === 0 ? (
        <div data-testid="segment-list-empty" className="py-8 text-center text-gray-500">
          <p>No segments yet.</p>
          {onAddNew && (
            <button
              onClick={onAddNew}
              data-testid="segment-list-add-first"
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add First Segment
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {segments.map((segment) => (
            <li
              key={segment.id}
              data-testid={`segment-item-${segment.id}`}
              className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    data-testid={`segment-order-${segment.id}`}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center"
                  >
                    {segment.order}
                  </span>
                  <span
                    data-testid={`segment-label-${segment.id}`}
                    className="font-semibold text-gray-800 truncate"
                  >
                    {segment.label}
                  </span>
                </div>
                <div className="mt-1 ml-10 text-sm text-gray-500">
                  <span data-testid={`segment-time-${segment.id}`}>
                    {formatMs(segment.startMs)} – {formatMs(segment.endMs)}
                  </span>
                </div>
                {segment.lyricText && (
                  <p
                    data-testid={`segment-lyrics-${segment.id}`}
                    className="mt-2 ml-10 text-sm text-gray-600 line-clamp-2"
                  >
                    {segment.lyricText}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {onEdit && (
                  <button
                    onClick={() => onEdit(segment)}
                    data-testid={`segment-edit-${segment.id}`}
                    className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(segment)}
                    data-testid={`segment-delete-${segment.id}`}
                    className="px-3 py-1 text-sm border border-red-300 rounded text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {onAddNew && segments.length > 0 && (
        <div className="mt-4 text-right">
          <button
            onClick={onAddNew}
            data-testid="segment-list-add"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Segment
          </button>
        </div>
      )}
    </div>
  );
}
