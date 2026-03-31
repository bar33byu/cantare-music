"use client";

import { useEffect, useMemo, useState } from 'react';
import { Segment } from '../types/index';
import { SegmentList } from './SegmentList';
import { SegmentForm } from './SegmentForm';
import { ReplaceAudioForm } from './ReplaceAudioForm';
import { SegmentTimeline } from './SegmentTimeline';

interface SegmentEditorProps {
  songId: string;
  onBack?: () => void;
  onSongUpdated?: () => void;
}

export function SegmentEditor({ songId, onBack, onSongUpdated }: SegmentEditorProps) {
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);

  const handleEdit = (segment: Segment) => {
    setIsAddingNew(false);
    setEditingSegment(segment);
  };

  const handleAddNew = () => {
    setEditingSegment(null);
    setIsAddingNew(true);
  };

  const handleDelete = async (segment: Segment) => {
    setDeleteError(null);
    try {
      const response = await fetch(`/api/songs/${songId}/segments/${segment.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      setRefreshKey((prev) => prev + 1);
    } catch {
      setDeleteError('Failed to delete segment. Please try again.');
    }
  };

  const handleFormSuccess = () => {
    setEditingSegment(null);
    setIsAddingNew(false);
    setRefreshKey((prev) => prev + 1);
  };

  const handleFormCancel = () => {
    setEditingSegment(null);
    setIsAddingNew(false);
  };

  const showForm = isAddingNew || editingSegment !== null;
  const timelineDurationMs = useMemo(() => {
    const maxEnd = Math.max(0, ...segments.map((segment) => segment.endMs));
    return maxEnd > 0 ? maxEnd : 60000;
  }, [segments]);

  useEffect(() => {
    let cancelled = false;

    const loadSegments = async () => {
      try {
        const response = await fetch(`/api/songs/${songId}/segments`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Segment[];
        if (!cancelled) {
          setSegments(data.sort((a, b) => a.order - b.order));
        }
      } catch {
        // SegmentList owns user-facing fetch errors, so this stays silent.
      }
    };

    void loadSegments();

    return () => {
      cancelled = true;
    };
  }, [songId, refreshKey]);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Edit Segments</h2>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            ← Back to Practice
          </button>
        )}
      </div>

      {deleteError && (
        <div role="alert" className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {deleteError}
        </div>
      )}

      <ReplaceAudioForm songId={songId} onReplaced={onSongUpdated} />

      <div className="mb-4 rounded-lg border border-indigo-100 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Segment map</p>
        <SegmentTimeline
          durationMs={timelineDurationMs}
          segments={segments}
          activeSegmentId={editingSegment?.id}
          onSegmentClick={handleEdit}
        />
      </div>

      {showForm ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingSegment ? 'Edit Segment' : 'Add Segment'}
          </h3>
          <SegmentForm
            songId={songId}
            segment={editingSegment ?? undefined}
            durationMs={timelineDurationMs}
            existingSegments={segments}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </div>
      ) : (
        <SegmentList
          songId={songId}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddNew={handleAddNew}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
