"use client";

import { useState, FormEvent } from 'react';
import { Segment } from '../types/index';
import { SegmentTimeline } from './SegmentTimeline';

interface SegmentFormProps {
  songId: string;
  segment?: Segment; // If provided, we're editing; if not, we're creating
  durationMs: number;
  existingSegments: Segment[];
  onSuccess: (segment: Segment) => void;
  onCancel?: () => void;
}

export function SegmentForm({ songId, segment, durationMs, existingSegments, onSuccess, onCancel }: SegmentFormProps) {
  const [label, setLabel] = useState(segment?.label || '');
  const [order, setOrder] = useState(segment?.order?.toString() || '');
  const defaultEndMs = durationMs > 0 ? Math.min(durationMs, 10000) : 10000;
  const [startMs, setStartMs] = useState(segment?.startMs ?? 0);
  const [endMs, setEndMs] = useState(segment?.endMs ?? defaultEndMs);
  const [lyricText, setLyricText] = useState(segment?.lyricText || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isEditing = !!segment;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation
    if (!label.trim()) {
      setError('Label is required');
      setLoading(false);
      return;
    }

    const orderNum = parseInt(order);
    if (isNaN(orderNum) || orderNum < 0) {
      setError('Order must be a non-negative number');
      setLoading(false);
      return;
    }

    if (startMs < 0) {
      setError('Start time must be a non-negative number');
      setLoading(false);
      return;
    }

    if (endMs < 0) {
      setError('End time must be a non-negative number');
      setLoading(false);
      return;
    }

    if (endMs <= startMs) {
      setError('End time must be greater than start time');
      setLoading(false);
      return;
    }

    try {
      const segmentData = {
        id: segment?.id || crypto.randomUUID(),
        label: label.trim(),
        order: orderNum,
        startMs,
        endMs,
        lyricText: lyricText.trim(),
      };

      let response;
      if (isEditing) {
        // Update existing segment
        response = await fetch(`/api/songs/${songId}/segments/${segment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: segmentData.label,
            order: segmentData.order,
            startMs: segmentData.startMs,
            endMs: segmentData.endMs,
            lyricText: segmentData.lyricText,
          }),
        });
      } else {
        // Create new segment
        response = await fetch(`/api/songs/${songId}/segments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(segmentData),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} segment`);
      }

      const savedSegment = await response.json();
      onSuccess(savedSegment);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="label" className="block text-sm font-medium text-gray-700">
          Label *
        </label>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          data-testid="segment-label-input"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="e.g., Verse 1, Chorus, Bridge"
        />
      </div>

      <div>
        <label htmlFor="order" className="block text-sm font-medium text-gray-700">
          Order *
        </label>
        <input
          id="order"
          type="number"
          value={order}
          onChange={(e) => setOrder(String(e.target.value))}
          data-testid="segment-order-input"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="0"
        />
        <p className="mt-1 text-sm text-gray-500">Position in the song (0-based)</p>
      </div>

      <div>
        <p className="mb-2 block text-sm font-medium text-gray-700">Segment boundaries *</p>
        <SegmentTimeline
          durationMs={durationMs}
          segments={existingSegments}
          activeSegmentId={segment?.id}
          editState={{
            startMs,
            endMs,
            onChange: (nextStartMs, nextEndMs) => {
              setStartMs(nextStartMs);
              setEndMs(nextEndMs);
            },
          }}
        />
      </div>

      <div>
        <label htmlFor="lyricText" className="block text-sm font-medium text-gray-700">
          Lyric Text
        </label>
        <textarea
          id="lyricText"
          value={lyricText}
          onChange={(e) => setLyricText(e.target.value)}
          rows={4}
          data-testid="segment-lyrics-input"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Enter the lyrics for this segment..."
        />
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded" role="alert">
          {error}
        </div>
      )}

      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            data-testid="segment-cancel-button"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="segment-submit-button"
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Segment' : 'Create Segment')}
        </button>
      </div>
    </form>
  );
}