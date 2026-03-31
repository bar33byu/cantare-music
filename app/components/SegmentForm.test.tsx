import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SegmentForm } from './SegmentForm';
import { Segment } from '../types/index';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SegmentForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const songId = 'song-123';
  const durationMs = 40000;

  const existingSegments: Segment[] = [
    {
      id: 'seg-0',
      songId,
      label: 'Intro',
      order: 0,
      startMs: 0,
      endMs: 8000,
      lyricText: 'Intro lyrics',
    },
  ];

  const mockSegment: Segment = {
    id: 'seg-1',
    songId,
    label: 'Verse 1',
    order: 1,
    startMs: 0,
    endMs: 10000,
    lyricText: 'Amazing grace, how sweet the sound',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSegment),
    });
  });

  describe('Create Mode', () => {
    it('renders label/order/lyrics fields and timeline editor', () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByTestId('segment-label-input')).toBeInTheDocument();
      expect(screen.getByTestId('segment-order-input')).toBeInTheDocument();
      expect(screen.getByTestId('segment-lyrics-input')).toBeInTheDocument();
      expect(screen.getByTestId('segment-timeline')).toBeInTheDocument();
      expect(screen.queryByTestId('segment-start-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('segment-end-input')).not.toBeInTheDocument();
    });

    it('submits create request with timeline boundary values', async () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      fireEvent.change(screen.getByTestId('segment-label-input'), { target: { value: 'Verse 1' } });
      fireEvent.change(screen.getByTestId('segment-order-input'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('segment-lyrics-input'), { target: { value: 'Test lyrics' } });

      fireEvent.click(screen.getByTestId('segment-submit-button'));

      await waitFor(() => {
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toBe(`/api/songs/${songId}/segments`);
        const body = JSON.parse(call[1].body);
        expect(typeof body.id).toBe('string');
        expect(body.label).toBe('Verse 1');
        expect(body.order).toBe(1);
        expect(body.startMs).toBe(0);
        expect(body.endMs).toBe(10000);
        expect(body.lyricText).toBe('Test lyrics');
      });

      expect(mockOnSuccess).toHaveBeenCalledWith(mockSegment);
    });

    it('shows validation error for empty label', async () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      fireEvent.change(screen.getByTestId('segment-label-input'), { target: { value: '' } });
      fireEvent.change(screen.getByTestId('segment-order-input'), { target: { value: '1' } });

      fireEvent.click(screen.getByTestId('segment-submit-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Label is required');
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows validation error for invalid order', async () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      fireEvent.change(screen.getByTestId('segment-label-input'), { target: { value: 'Verse 1' } });
      fireEvent.change(screen.getByTestId('segment-order-input'), { target: { value: '-1' } });

      fireEvent.click(screen.getByTestId('segment-submit-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Order must be a non-negative number');
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      fireEvent.change(screen.getByTestId('segment-label-input'), { target: { value: 'Verse 1' } });
      fireEvent.change(screen.getByTestId('segment-order-input'), { target: { value: '1' } });

      fireEvent.click(screen.getByTestId('segment-submit-button'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Edit Mode', () => {
    it('pre-populates form with segment data', async () => {
      render(
        <SegmentForm
          songId={songId}
          segment={mockSegment}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('segment-label-input')).toHaveValue('Verse 1');
        expect(screen.getByTestId('segment-order-input')).toHaveValue(1);
        expect(screen.getByTestId('segment-lyrics-input')).toHaveValue('Amazing grace, how sweet the sound');
      });

      expect(screen.getByText('Update Segment')).toBeInTheDocument();
    });

    it('submits update request with changed fields', async () => {
      render(
        <SegmentForm
          songId={songId}
          segment={mockSegment}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
        />
      );

      fireEvent.change(screen.getByTestId('segment-label-input'), { target: { value: 'Chorus' } });

      fireEvent.click(screen.getByTestId('segment-submit-button'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${songId}/segments/${mockSegment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Chorus',
            order: 1,
            startMs: 0,
            endMs: 10000,
            lyricText: 'Amazing grace, how sweet the sound',
          }),
        });
      });

      expect(mockOnSuccess).toHaveBeenCalledWith(mockSegment);
    });
  });

  describe('Cancel Functionality', () => {
    it('shows cancel button when onCancel provided', () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByTestId('segment-cancel-button')).toBeInTheDocument();
    });

    it('calls onCancel when cancel button clicked', () => {
      render(
        <SegmentForm
          songId={songId}
          durationMs={durationMs}
          existingSegments={existingSegments}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      fireEvent.click(screen.getByTestId('segment-cancel-button'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
