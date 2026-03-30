"use client";

import { useState, useEffect, useCallback, DragEvent } from 'react';
import { Segment } from '../types/index';
import { DraggableSegmentCard } from './DraggableSegmentCard';

interface SegmentListProps {
  songId: string;
  onEdit?: (segment: Segment) => void;
  onDelete?: (segment: Segment) => void;
  onAddNew?: () => void;
  /** If provided, the list will refresh when this value changes */
  refreshKey?: number;
}

export function SegmentList({ songId, onEdit, onDelete, onAddNew, refreshKey }: SegmentListProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

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

  const handleDragStart = (_e: DragEvent<HTMLLIElement>, segment: Segment) => {
    setDraggedId(segment.id);
    setReorderError(null);
  };

  const handleDragOver = (_e: DragEvent<HTMLLIElement>, segment: Segment) => {
    if (segment.id !== draggedId) {
      setDragOverId(segment.id);
    }
  };

  const handleDragEnd = (_e: DragEvent<HTMLLIElement>) => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = async (_e: DragEvent<HTMLLIElement>, targetSegment: Segment) => {
    if (!draggedId || draggedId === targetSegment.id) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIndex = segments.findIndex(s => s.id === draggedId);
    const toIndex = segments.findIndex(s => s.id === targetSegment.id);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const prevSegments = [...segments];
    const reordered = [...segments];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const withNewOrders = reordered.map((s, i) => ({ ...s, order: i }));
    setSegments(withNewOrders);
    setDraggedId(null);
    setDragOverId(null);
    try {
      const response = await fetch(`/api/songs/${songId}/segments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withNewOrders.map(s => ({ id: s.id, order: s.order }))),
      });
      if (!response.ok) throw new Error('Failed to save order');
    } catch {
      setReorderError('Failed to save new order. Please try again.');
      setSegments(prevSegments);
    }
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
      {reorderError && (
        <div role="alert" data-testid="reorder-error" className="mb-3 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
          {reorderError}
        </div>
      )}
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
            <DraggableSegmentCard
              key={segment.id}
              segment={segment}
              isDragging={draggedId === segment.id}
              isDragOver={dragOverId === segment.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
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
