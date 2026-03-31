import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentEditor } from './SegmentEditor';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
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

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(),
}));

vi.mock('./ReplaceAudioForm', () => ({
  ReplaceAudioForm: () => <div data-testid="replace-audio" />,
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

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => sampleSegments,
        } as Response;
      }

      if (url.endsWith('/api/songs/song-1/segments') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ ...sampleSegments[0], id: 'seg-new' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected request' }),
      } as Response;
    });

    global.fetch = mockFetch;
  });

  it('renders inline segment canvas blocks', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-board')).toBeInTheDocument();
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
      expect(screen.getByTestId('segment-block-seg-2')).toBeInTheDocument();
    });
  });

  it('creates new section using timeline-aware defaults', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments');
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(40500);
      expect(body.endMs).toBe(60500);
    });
  });

  it('plays from current transport position', async () => {
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

  it('play toggle still requests playback before readiness settles', async () => {
    const play = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: false,
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
      expect(screen.getByTestId('segment-editor-play-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-play-toggle'));
    expect(play).toHaveBeenCalledWith(2000, 60000);
  });

  it('renders full-song timeline strip and seeks from slider', async () => {
    const seek = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 5000,
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
      seek,
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-song-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('song-timeline-segment-seg-1')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('segment-editor-song-seek'), { target: { value: '15000' } });
    expect(seek).toHaveBeenCalledWith(15000);
  });

  it('saves selected label changes via patch on blur', async () => {
    render(<SegmentEditor songId="song-1" />);

    const segment = await screen.findByTestId('segment-block-seg-1');
    fireEvent.click(segment);

    const labelInput = await screen.findByTestId('segment-editor-label-input');
    fireEvent.change(labelInput, { target: { value: 'Refrain' } });
    fireEvent.blur(labelInput);

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/seg-1') && init?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('drags start edge and saves updated bounds', async () => {
    render(<SegmentEditor songId="song-1" />);

    const board = await screen.findByTestId('segment-editor-board');
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 560,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 560,
      toJSON: () => ({}),
    });

    const startHandle = screen.getByLabelText('Resize start Section 1');
    fireEvent.pointerDown(startHandle, { pointerId: 11, clientX: 0 });

    fireEvent.pointerMove(window, { pointerId: 11, clientX: 100 });
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 100 });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/seg-1') && init?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(6000);
    });
  });

  it('drags full segment horizontally and saves shifted bounds', async () => {
    render(<SegmentEditor songId="song-1" />);

    const board = await screen.findByTestId('segment-editor-board');
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 560,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 560,
      toJSON: () => ({}),
    });

    const moveHandle = screen.getByLabelText('Move Section 1');
    fireEvent.pointerDown(moveHandle, { pointerId: 22, clientX: 0 });
    fireEvent.pointerMove(window, { pointerId: 22, clientX: 100 });
    fireEvent.pointerUp(window, { pointerId: 22, clientX: 100 });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/seg-1') && init?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(6000);
      expect(body.endMs).toBe(26000);
    });
  });

  it('rounds startMs and endMs to integers in the POST payload', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 1234.567,
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

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments');
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall?.[1]?.body ?? '{}'));
      expect(Number.isInteger(body.startMs)).toBe(true);
      expect(Number.isInteger(body.endMs)).toBe(true);
    });
  });

  it('shows undo banner after delete and restores section on undo click', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-delete-seg-1'));

    const undoBtn = await screen.findByTestId('segment-editor-undo-delete');
    expect(undoBtn).toBeInTheDocument();
    // Undo banner should mention the deleted section's label
    expect(screen.getByText(/Section 1.*deleted/i)).toBeInTheDocument();

    fireEvent.click(undoBtn);

    await waitFor(() => {
      const restoreCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/api/songs/song-1/segments') &&
          init?.method === 'POST' &&
          JSON.parse(String(init.body ?? '{}')).id === 'seg-1'
      );
      expect(restoreCall).toBeTruthy();
    });

    expect(screen.queryByTestId('segment-editor-undo-delete')).not.toBeInTheDocument();
  });

  it('zooms canvas in and out from whole-song default', async () => {
    render(<SegmentEditor songId="song-1" />);

    const board = await screen.findByTestId('segment-editor-board');
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('100%');
    expect(board).toHaveStyle({ width: '100%' });

    fireEvent.click(screen.getByTestId('segment-editor-zoom-in'));
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('150%');
    expect(board).toHaveStyle({ width: '150%' });

    fireEvent.click(screen.getByTestId('segment-editor-zoom-out'));
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('100%');
    expect(board).toHaveStyle({ width: '100%' });
  });

  it('loads song title into input and saves on blur', async () => {
    const onSongUpdated = vi.fn();
    render(<SegmentEditor songId="song-1" onSongUpdated={onSongUpdated} />);

    const titleInput = await screen.findByTestId('segment-editor-title-input');
    expect(titleInput).toHaveValue('My Song');

    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1') &&
          !String(url).includes('/segments') &&
          init?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.title).toBe('New Title');
    });
    expect(onSongUpdated).toHaveBeenCalled();
  });

  it('hides ReplaceAudioForm until toggle is clicked', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.queryByTestId('replace-audio')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-replace-audio-toggle'));
    expect(screen.getByTestId('replace-audio')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('segment-editor-replace-audio-toggle'));
    expect(screen.queryByTestId('replace-audio')).not.toBeInTheDocument();
  });

  it('renders playhead line on the canvas board', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 10000,
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

    render(<SegmentEditor songId="song-1" />);

    const playhead = await screen.findByTestId('segment-editor-canvas-playhead');
    // 10000 / 60000 ≈ 16.67% — just verify a non-zero left position is set
    const style = playhead.getAttribute('style') ?? '';
    expect(style).toMatch(/left/);
    expect(style).not.toBe('left: 0%');
  });
});
