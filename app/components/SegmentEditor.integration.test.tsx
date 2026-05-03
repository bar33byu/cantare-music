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
    lyricText: 'lyrics for section 1',
  },
  {
    id: 'seg-2',
    songId: 'song-1',
    label: 'Section 2',
    order: 1,
    startMs: 20000,
    endMs: 40000,
    lyricText: 'lyrics for section 2',
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

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'DELETE') {
        const segmentId = url.split('/').pop();
        segmentsState = segmentsState.filter((segment) => segment.id !== segmentId);
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected fetch' }),
      } as Response;
    });

    global.fetch = mockFetch;
  });

  it('creates, edits, and deletes from inline segment canvas', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
      expect(screen.getByTestId('segment-block-seg-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));
    fireEvent.click(screen.getByText('Section 1'));
    const labelInput = await screen.findByTestId('segment-editor-label-input');
    fireEvent.change(labelInput, { target: { value: 'Section A' } });
    fireEvent.blur(labelInput);

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/seg-1') && init?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('segment-delete-seg-2'));

    await waitFor(() => {
      const deleteCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/seg-2') && init?.method === 'DELETE'
      );
      expect(deleteCall).toBeTruthy();
    });

    // Undo banner should appear
    expect(await screen.findByTestId('segment-editor-undo-delete')).toBeInTheDocument();

    // Click Undo — should re-POST the deleted segment
    fireEvent.click(screen.getByTestId('segment-editor-undo-delete'));

    await waitFor(() => {
      const restoreCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/api/songs/song-1/segments') &&
          init?.method === 'POST' &&
          JSON.parse(String(init.body ?? '{}')).id === 'seg-2'
      );
      expect(restoreCall).toBeTruthy();
    });

    // Banner should be gone after undo
    expect(screen.queryByTestId('segment-editor-undo-delete')).not.toBeInTheDocument();
  });
});
