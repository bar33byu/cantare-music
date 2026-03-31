import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentEditor } from './SegmentEditor';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { Segment } from '../types';

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(),
}));

vi.mock('./ReplaceAudioForm', () => ({
  ReplaceAudioForm: () => <div data-testid="replace-audio" />,
}));

const initialSegments: Segment[] = [
  {
    id: 'seg-1',
    songId: 'song-1',
    label: 'Section 1',
    order: 0,
    startMs: 0,
    endMs: 20000,
    lyricText: 'first',
  },
  {
    id: 'seg-2',
    songId: 'song-1',
    label: 'Section 2',
    order: 1,
    startMs: 20000,
    endMs: 40000,
    lyricText: 'second',
  },
];

describe('SegmentEditor integration', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 1000,
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

    let segmentsState = [...initialSegments];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments')) {
        return {
          ok: true,
          json: async () => ({ id: 'song-1', audioUrl: '/audio/song.mp3' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsState,
        } as Response;
      }

      if (url.endsWith('/api/songs/song-1/segments') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Segment;
        const created: Segment = {
          id: body.id,
          songId: 'song-1',
          label: body.label,
          order: 2,
          startMs: body.startMs,
          endMs: body.endMs,
          lyricText: body.lyricText,
        };
        segmentsState = [...segmentsState, created];
        return {
          ok: true,
          json: async () => created,
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected fetch' }),
      } as Response;
    });

    global.fetch = mockFetch;
  });

  it('creates a new section from editor and clears form state after save', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments');
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    const labelInput = await screen.findByTestId('segment-label-input');
    fireEvent.change(labelInput, { target: { value: 'Section 3' } });

    fireEvent.click(screen.getByTestId('segment-submit-button'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(40500);
      expect(body.endMs).toBe(60500);
      expect(body.label).toBe('Section 3');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('segment-submit-button')).not.toBeInTheDocument();
    });
  });
});
