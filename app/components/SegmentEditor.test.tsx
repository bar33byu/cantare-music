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

  it('uses a playable proxied audio URL for edit-page playback', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(vi.mocked(useAudioPlayer)).toHaveBeenCalledWith('/api/audio/audio/song.mp3');
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

  it('bulk-imports sections from separator-delimited lyrics with equal timing', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: {
        value: ['Line A1', 'Line A2', '*', 'Line B1', 'Line B2'].join('\n'),
      },
    });
    fireEvent.click(screen.getByTestId('segment-editor-bulk-submit'));

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/') && init?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThanOrEqual(2);

      const firstPatchBody = JSON.parse(String(patchCalls[patchCalls.length - 2][1]?.body ?? '{}'));
      const secondPatchBody = JSON.parse(String(patchCalls[patchCalls.length - 1][1]?.body ?? '{}'));

      expect(firstPatchBody.startMs).toBe(0);
      expect(firstPatchBody.endMs).toBe(30000);
      expect(firstPatchBody.lyricText).toBe('Line A1\nLine A2');

      expect(secondPatchBody.startMs).toBe(30000);
      expect(secondPatchBody.endMs).toBe(60000);
      expect(secondPatchBody.lyricText).toBe('Line B1\nLine B2');

      const createCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );

      // No new sections are needed when there are already 2 existing sections.
      expect(createCalls.length).toBe(0);
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
      expect(screen.getByTestId('segment-editor-audio-status-badge')).toHaveTextContent('Attached');
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
      expect(screen.getByTestId('segment-editor-audio-status-badge')).toHaveTextContent('Attached');
    });

    fireEvent.click(screen.getByTestId('segment-editor-play-toggle'));
    expect(play).toHaveBeenCalledWith(2000, 60000);
  });

  it('renders practice-style skip controls and seeks by 5 seconds', async () => {
    const seek = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
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
      seek,
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-skip-back')).toBeInTheDocument();
    });

    expect(screen.getByTestId('segment-editor-skip-back')).toHaveTextContent('-5');
    expect(screen.getByTestId('segment-editor-skip-forward')).toHaveTextContent('+5');

    fireEvent.click(screen.getByTestId('segment-editor-skip-back'));
    fireEvent.click(screen.getByTestId('segment-editor-skip-forward'));

    expect(seek).toHaveBeenNthCalledWith(1, 5000);
    expect(seek).toHaveBeenNthCalledWith(2, 15000);
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

  it('saves inline segment label changes without selecting a segment', async () => {
    render(<SegmentEditor songId="song-1" />);

    const inlineLabel = await screen.findByTestId('segment-inline-label-input-seg-1');
    fireEvent.change(inlineLabel, { target: { value: 'Section Inline' } });
    fireEvent.blur(inlineLabel);

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('Section Inline')
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

  it('shows attached audio status and replace wording when audio exists', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-audio-status-badge')).toHaveTextContent('Attached');
      expect(screen.getByTestId('segment-editor-audio-status-text')).toHaveTextContent('Current file: song.mp3');
    });

    expect(screen.getByTestId('segment-editor-replace-audio-toggle')).toHaveTextContent('Replace audio file');
  });

  it('shows missing audio status and upload wording when no audio exists', async () => {
    const noAudioFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-no-audio') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '', title: 'No Audio Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-no-audio/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected request' }),
      } as Response;
    });

    global.fetch = noAudioFetch;
    render(<SegmentEditor songId="song-no-audio" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-audio-status-badge')).toHaveTextContent('Missing');
      expect(screen.getByTestId('segment-editor-audio-status-text')).toHaveTextContent('No audio file uploaded yet.');
    });

    expect(screen.getByTestId('segment-editor-replace-audio-toggle')).toHaveTextContent('Upload audio file');
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

  it('captures a pitch contour note from the tap zone for the selected section', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
      expect(screen.getByTestId('segment-editor-pitch-tap-zone')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));

    const tapZone = screen.getByTestId('segment-editor-pitch-tap-zone');
    Object.defineProperty(tapZone, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 88, height: 200, right: 88, bottom: 200 }),
      configurable: true,
    });

    fireEvent.pointerDown(tapZone, { pointerId: 1, clientY: 40 });
    fireEvent.pointerUp(tapZone, { pointerId: 1, clientY: 40 });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.pitchContourNotes).toHaveLength(1);
      expect(body.pitchContourNotes[0].timeOffsetMs).toBe(1500);
      expect(body.pitchContourNotes[0].durationMs).toBeGreaterThanOrEqual(120);
      expect(body.pitchContourNotes[0].lane).toBeCloseTo(0.8, 1);
    });

    expect(screen.getByTestId('segment-editor-pitch-count')).toHaveTextContent('1 notes');
  });

  it('captures a pitch contour note when tapping in the preview bar', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));

    const preview = screen.getByTestId('segment-editor-pitch-preview');
    Object.defineProperty(preview, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      configurable: true,
    });

    fireEvent.pointerDown(preview, { pointerId: 4, clientX: 100, clientY: 30 });
    fireEvent.pointerUp(preview, { pointerId: 4, clientX: 100, clientY: 30 });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.pitchContourNotes.length).toBeGreaterThan(0);
    });
  });

  it('changes playback speed from speed controls', async () => {
    const setPlaybackRate = vi.fn();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 1500,
      durationMs: 60000,
      playbackRate: 1,
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
      setPlaybackRate,
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-speed-50')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-speed-50'));
    fireEvent.click(screen.getByTestId('segment-editor-speed-75'));

    expect(setPlaybackRate).toHaveBeenNthCalledWith(1, 0.5);
    expect(setPlaybackRate).toHaveBeenNthCalledWith(2, 0.75);
  });

  it('clears captured pitch contour notes', async () => {
    const segmentsWithContour: Segment[] = [
      {
        ...sampleSegments[0],
        pitchContourNotes: [{ id: 'note-1', timeOffsetMs: 1000, durationMs: 250, lane: 0.6 }],
      },
      sampleSegments[1],
    ];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsWithContour,
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));
    fireEvent.click(screen.getByTestId('segment-editor-pitch-clear'));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}'));
      expect(body.pitchContourNotes).toEqual([]);
    });
  });

  it('renders song-level pitch strip entries from saved contour notes', async () => {
    const segmentsWithContour: Segment[] = [
      {
        ...sampleSegments[0],
        pitchContourNotes: [{ id: 'note-1', timeOffsetMs: 1000, durationMs: 250, lane: 0.6 }],
      },
      {
        ...sampleSegments[1],
        pitchContourNotes: [{ id: 'note-2', timeOffsetMs: 500, durationMs: 400, lane: 0.2 }],
      },
    ];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsWithContour,
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-song-pitch-strip')).toBeInTheDocument();
      expect(screen.getByTestId('song-pitch-note-seg-1-note-1')).toBeInTheDocument();
      expect(screen.getByTestId('song-pitch-note-seg-2-note-2')).toBeInTheDocument();
    });
  });

  it('captures song-level pitch without selecting a segment', async () => {
    render(<SegmentEditor songId="song-1" />);

    const strip = await screen.findByTestId('segment-editor-song-pitch-strip');
    const stripInner = strip.querySelector('div.relative.h-full.min-w-full') as HTMLDivElement;
    Object.defineProperty(stripInner, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 300, height: 48, right: 300, bottom: 48 }),
      configurable: true,
    });

    fireEvent.pointerDown(strip, { pointerId: 15, clientY: 8 });
    fireEvent.pointerUp(strip, { pointerId: 15, clientY: 8 });

    await waitFor(() => {
      const pitchPatchCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(pitchPatchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(pitchPatchCalls[pitchPatchCalls.length - 1][1]?.body ?? '{}'));
      expect(body.pitchContourNotes.length).toBeGreaterThan(0);
      expect(body.pitchContourNotes[0].lane).toBeGreaterThan(0.75);
    });
  });

  it('captures from the main pitch panel into the playback segment without selecting a section', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 25000,
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
      expect(screen.getByTestId('segment-editor-pitch-target-label')).toHaveTextContent('Section 2');
    });

    const tapZone = screen.getByTestId('segment-editor-pitch-tap-zone');
    Object.defineProperty(tapZone, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 88, height: 200, right: 88, bottom: 200 }),
      configurable: true,
    });

    fireEvent.pointerDown(tapZone, { pointerId: 21, clientY: 50 });
    fireEvent.pointerUp(tapZone, { pointerId: 21, clientY: 50 });

    await waitFor(() => {
      const pitchPatchCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-2') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(pitchPatchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(pitchPatchCalls[pitchPatchCalls.length - 1][1]?.body ?? '{}'));
      expect(body.pitchContourNotes).toHaveLength(1);
      expect(body.pitchContourNotes[0].timeOffsetMs).toBe(5000);
    });
  });

  it('prevents contour overlap by clamping note end before the next note', async () => {
    const segmentsWithContour: Segment[] = [
      {
        ...sampleSegments[0],
        pitchContourNotes: [{ id: 'existing', timeOffsetMs: 1800, durationMs: 250, lane: 0.4 }],
      },
      sampleSegments[1],
    ];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsWithContour,
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(5000);

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));

    const tapZone = screen.getByTestId('segment-editor-pitch-tap-zone');
    Object.defineProperty(tapZone, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 88, height: 200, right: 88, bottom: 200 }),
      configurable: true,
    });

    fireEvent.pointerDown(tapZone, { pointerId: 1, clientY: 40 });
    fireEvent.pointerUp(tapZone, { pointerId: 1, clientY: 40 });

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(patchCalls[patchCalls.length - 1][1]?.body ?? '{}'));
      const created = body.pitchContourNotes.find((note: { id: string }) => note.id !== 'existing');
      expect(created).toBeTruthy();
      expect(created.timeOffsetMs + created.durationMs).toBeLessThanOrEqual(1800);
    });

    nowSpy.mockRestore();
  });

  it('drags an existing contour note and saves updated timing and lane', async () => {
    const segmentsWithContour: Segment[] = [
      {
        ...sampleSegments[0],
        pitchContourNotes: [{ id: 'note-1', timeOffsetMs: 1000, durationMs: 250, lane: 0.6 }],
      },
      sampleSegments[1],
    ];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsWithContour,
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));

    const preview = await screen.findByTestId('segment-editor-pitch-preview');
    Object.defineProperty(preview, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      configurable: true,
    });

    const note = screen.getByTestId('segment-editor-pitch-note-move-note-1');
    fireEvent.pointerDown(note, { pointerId: 7, clientX: 10, clientY: 80 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 100, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 100, clientY: 20 });

    await waitFor(() => {
      const pitchPatchCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(pitchPatchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(pitchPatchCalls[pitchPatchCalls.length - 1][1]?.body ?? '{}'));
      expect(body.pitchContourNotes[0].timeOffsetMs).toBe(10000);
      expect(body.pitchContourNotes[0].lane).toBeCloseTo(0.9, 1);
    });
  });

  it('resizes an existing contour note duration from the end handle', async () => {
    const segmentsWithContour: Segment[] = [
      {
        ...sampleSegments[0],
        pitchContourNotes: [{ id: 'note-1', timeOffsetMs: 1000, durationMs: 250, lane: 0.6 }],
      },
      sampleSegments[1],
    ];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '/audio/song.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => segmentsWithContour,
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-block-seg-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-block-seg-1'));

    const preview = await screen.findByTestId('segment-editor-pitch-preview');
    Object.defineProperty(preview, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      configurable: true,
    });

    const endHandle = screen.getByTestId('segment-editor-pitch-note-end-note-1');
    fireEvent.pointerDown(endHandle, { pointerId: 8, clientX: 20, clientY: 80 });
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 80, clientY: 80 });

    await waitFor(() => {
      const pitchPatchCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/api/songs/song-1/segments/seg-1') &&
          init?.method === 'PATCH' &&
          String(init?.body ?? '').includes('pitchContourNotes')
      );
      expect(pitchPatchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(pitchPatchCalls[pitchPatchCalls.length - 1][1]?.body ?? '{}'));
      expect(body.pitchContourNotes[0].timeOffsetMs).toBe(1000);
      expect(body.pitchContourNotes[0].durationMs).toBe(6250);
    });
  });
});
