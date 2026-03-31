import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentEditor } from './SegmentEditor';
import type { Segment } from '../types';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

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

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(),
}));

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
  SegmentForm: ({
    durationMs,
    existingSegments,
    draftValues,
  }: {
    durationMs: number;
    existingSegments: Segment[];
    draftValues?: { label?: string; startMs?: number; endMs?: number };
  }) => (
    <div
      data-testid="segment-form"
      data-duration-ms={durationMs}
      data-existing-count={existingSegments.length}
      data-draft-start-ms={draftValues?.startMs}
      data-draft-end-ms={draftValues?.endMs}
      data-draft-label={draftValues?.label}
    />
  ),
}));

describe('SegmentEditor', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 1500,
      durationMs: 60000,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 0,
        networkState: 0,
        preload: 'none',
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'init',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
    });
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/segments')) {
        return {
          ok: true,
          json: async () => sampleSegments,
        } as Response;
      }

      if (url.includes('/api/songs/song-1')) {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3' }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({}),
      } as Response;
    });
    global.fetch = mockFetch;
  });

  it('passes loaded timeline duration and segments to SegmentForm in add mode', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments');
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-duration-ms', '60000');
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-existing-count', '2');
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-draft-start-ms', '40500');
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-draft-end-ms', '60500');
  });

  it('opens edit form when clicking a segment on timeline', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('timeline-edit-seg-1'));
    expect(screen.getByTestId('segment-form')).toBeInTheDocument();
  });

  it('shows playback controls and plays from current time', async () => {
    const play = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 2000,
      durationMs: 60000,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 0,
        networkState: 0,
        preload: 'none',
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'init',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play,
      pause: vi.fn(),
      seek: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-playback-controls')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-play-toggle'));
    expect(play).toHaveBeenCalledWith(2000, 60000);
  });

  it('does not pause playback when opening add form and uses playback-anchored default', async () => {
    const pause = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 50000,
      durationMs: 60000,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 0,
        networkState: 0,
        preload: 'none',
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'init',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play: vi.fn(),
      pause,
      seek: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-new-section')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-draft-start-ms', '50000');
    expect(screen.getByTestId('segment-form')).toHaveAttribute('data-draft-end-ms', '70000');
  });
});
