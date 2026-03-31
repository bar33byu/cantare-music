import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentEditor } from './SegmentEditor';
import type { Segment } from '../types';

const sampleSegments: Segment[] = [
  {
    id: 'seg-1',
    songId: 'song-1',
    label: 'Section 1',
    order: 0,
    startMs: 0,
    endMs: 20000,
    lyricText: 'Line 1',
  },
  {
    id: 'seg-2',
    songId: 'song-1',
    label: 'Section 2',
    order: 1,
    startMs: 20000,
    endMs: 40000,
    lyricText: 'Line 2',
  },
];

vi.mock('./ReplaceAudioForm', () => ({
  ReplaceAudioForm: () => <div data-testid="replace-audio" />,
}));

vi.mock('./SegmentTimeline', () => ({
  SegmentTimeline: ({ onSegmentClick }: { onSegmentClick?: (segment: Segment) => void }) => (
    <div data-testid="segment-timeline">
      <button data-testid="timeline-edit-seg-1" onClick={() => onSegmentClick?.(sampleSegments[0])}>
        Edit section 1
      </button>
    </div>
  ),
}));

vi.mock('./SegmentList', () => ({
  SegmentList: ({ onAddNew }: { onAddNew?: () => void }) => (
    <div data-testid="segment-list">
      <button data-testid="segment-list-add" onClick={() => onAddNew?.()}>
        Add Segment
      </button>
    </div>
  ),
}));

vi.mock('./SegmentForm', () => ({
  SegmentForm: ({ durationMs, existingSegments }: { durationMs: number; existingSegments: Segment[] }) => (
    <div
      data-testid="segment-form"
      data-duration-ms={durationMs}
      data-existing-count={existingSegments.length}
    />
  ),
}));

describe('SegmentEditor', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleSegments,
    });
    global.fetch = mockFetch;
  });

  it('passes loaded timeline duration and segments to SegmentForm in add mode', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments');
    });

    fireEvent.click(screen.getByTestId('segment-list-add'));

    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-duration-ms', '40000');
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-existing-count', '2');
  });

  it('opens edit form when clicking a segment on timeline', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('timeline-edit-seg-1'));
    expect(screen.getByTestId('segment-form')).toBeInTheDocument();
  });
});
