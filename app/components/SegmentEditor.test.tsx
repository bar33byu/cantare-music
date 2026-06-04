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
  ReplaceAudioForm: ({ children }: { children?: unknown }) => <div data-testid="replace-audio">{children as any}</div>,
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
      setPlaybackEndMs: vi.fn(),
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

  it('creates a manual section at the current playhead', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 12_345,
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-new-section')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    await waitFor(() => {
      const createCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse(String(createCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(12_345);
      expect(body.endMs).toBe(32_345);
    });
  });

  it('uses the direct song audio URL for edit-page playback', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(vi.mocked(useAudioPlayer)).toHaveBeenCalledWith('/audio/song.mp3');
    });
  });

  it('uses blend audio for edit-page playback when prominent audio is missing', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ audioUrl: '', alternateAudioUrl: '/audio/blend.mp3', title: 'My Song' }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => sampleSegments,
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected request' }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(vi.mocked(useAudioPlayer)).toHaveBeenCalledWith('/audio/blend.mp3');
      expect(screen.getByTestId('segment-editor-board')).toBeInTheDocument();
    });
  });

  it('creates new section at the playhead', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments', expect.objectContaining({ cache: 'no-store' }));
    });

    fireEvent.click(screen.getByTestId('segment-editor-new-section'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall?.[1]?.body ?? '{}'));
      expect(body.startMs).toBe(1500);
      expect(body.endMs).toBe(21500);
    });
  });

  it('bulk-imports sections from blank-line-delimited lyrics with equal timing', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    const pastedLyrics = ['Line A1', 'Line A2', '', 'Line B1', 'Line B2'].join('\n');

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('300%');
    expect(screen.getByTestId('segment-editor-bulk-text')).toHaveClass('h-96');
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: {
        value: pastedLyrics,
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

      expect(firstPatchBody.startMs).toBe(13333);
      expect(firstPatchBody.endMs).toBe(26667);
      expect(firstPatchBody.lyricText).toBe('Line A1\nLine A2');

      expect(secondPatchBody.startMs).toBe(33333);
      expect(secondPatchBody.endMs).toBe(46667);
      expect(secondPatchBody.lyricText).toBe('Line B1\nLine B2');

      const createCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );

      // No new sections are needed when there are already 2 existing sections.
      expect(createCalls.length).toBe(0);
      expect(screen.getByTestId('segment-editor-bulk-panel')).toBeInTheDocument();
      expect(screen.getByTestId('segment-editor-bulk-text')).toHaveValue(pastedLyrics);
    });
  });

  it('supports a custom separator for bulk lyrics', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    const pastedLyrics = ['Line A1', 'Line A2', '***', 'Line B1', 'Line B2'].join('\n');

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    fireEvent.change(screen.getByTestId('segment-editor-bulk-separator'), {
      target: { value: '***' },
    });
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: { value: pastedLyrics },
    });
    fireEvent.click(screen.getByTestId('segment-editor-bulk-submit'));

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/') && init?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThanOrEqual(2);

      const firstPatchBody = JSON.parse(String(patchCalls[patchCalls.length - 2][1]?.body ?? '{}'));
      const secondPatchBody = JSON.parse(String(patchCalls[patchCalls.length - 1][1]?.body ?? '{}'));

      expect(firstPatchBody.lyricText).toBe('Line A1\nLine A2');
      expect(secondPatchBody.lyricText).toBe('Line B1\nLine B2');
    });
  });

  it('keeps bulk lyrics editable when a partial import fails', async () => {
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
          json: async () => sampleSegments,
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.label === '2') {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Database write failed' }),
          } as Response;
        }

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
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    const pastedLyrics = ['Line A1', 'Line A2', '', 'Line B1', 'Line B2'].join('\n');

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: { value: pastedLyrics },
    });
    fireEvent.click(screen.getByTestId('segment-editor-bulk-submit'));

    await waitFor(
      () => {
        expect(screen.getByTestId('segment-editor-bulk-panel')).toBeInTheDocument();
        expect(screen.getByTestId('segment-editor-bulk-text')).toHaveValue(pastedLyrics);
        expect(screen.getByText(/Failed sections: 2/i)).toBeInTheDocument();
        expect(screen.getByText(/First error: Database write failed \(500\)/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('rounds bulk import timings before sending create payloads', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 180244.89800000002,
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
      setPlaybackEndMs: vi.fn(),
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

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url.endsWith('/api/songs/song-1/segments') && method === 'POST') {
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
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    fireEvent.click(screen.getByTestId('segment-editor-bulk-replace'));
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: { value: ['One', '', 'Two', '', 'Three'].join('\n') },
    });
    fireEvent.click(screen.getByTestId('segment-editor-bulk-submit'));

    await waitFor(() => {
      const createCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(createCalls).toHaveLength(3);

      for (const [, init] of createCalls) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(Number.isInteger(body.startMs)).toBe(true);
        expect(Number.isInteger(body.endMs)).toBe(true);
      }

      const lastCreateBody = JSON.parse(String(createCalls[2][1]?.body ?? '{}'));
      expect(lastCreateBody.endMs).toBe(150204);
    });
  });

  it('bulk-import spreads sections across probed song duration when player duration is not ready', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: false,
      currentMs: 0,
      durationMs: 0,
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
      setPlaybackEndMs: vi.fn(),
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

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url.endsWith('/api/songs/song-1/segments') && method === 'POST') {
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

    const originalAudio = globalThis.Audio;
    class FakeAudio extends EventTarget {
      duration = 180;
      preload = 'none';

      load() {
        this.dispatchEvent(new Event('loadedmetadata'));
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
        super.addEventListener(type, listener as EventListener);
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
        super.removeEventListener(type, listener as EventListener);
      }
    }
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-bulk-open')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-bulk-open'));
    fireEvent.click(screen.getByTestId('segment-editor-bulk-replace'));
    fireEvent.change(screen.getByTestId('segment-editor-bulk-text'), {
      target: {
        value: ['Verse 1', '', 'Verse 2'].join('\n'),
      },
    });
    fireEvent.click(screen.getByTestId('segment-editor-bulk-submit'));

    await waitFor(() => {
      const createCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/songs/song-1/segments') && init?.method === 'POST'
      );
      expect(createCalls.length).toBe(2);

      const firstCreateBody = JSON.parse(String(createCalls[0][1]?.body ?? '{}'));
      const secondCreateBody = JSON.parse(String(createCalls[1][1]?.body ?? '{}'));

      expect(firstCreateBody.startMs).toBe(40000);
      expect(firstCreateBody.endMs).toBe(80000);
      expect(secondCreateBody.startMs).toBe(100000);
      expect(secondCreateBody.endMs).toBe(140000);
    });

    vi.stubGlobal('Audio', originalAudio);
  });

  it('keeps a second lyric draft intact when the first lyric field is blurred and saved', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('lyrics')).toHaveLength(2);
    });

    const lyricAreas = screen.getAllByPlaceholderText('lyrics') as HTMLTextAreaElement[];
    fireEvent.change(lyricAreas[0], { target: { value: 'Updated line 1' } });
    fireEvent.change(lyricAreas[1], { target: { value: 'Updated line 2 draft' } });
    fireEvent.blur(lyricAreas[0], { target: { value: 'Updated line 1' } });

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(
        ([url, init]) => String(url).includes('/api/songs/song-1/segments/') && init?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });

    const patchCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes('/api/songs/song-1/segments/') && init?.method === 'PATCH'
    );
    const firstPatchBody = JSON.parse(String(patchCalls.at(-1)?.[1]?.body ?? '{}'));

    expect(firstPatchBody.lyricText).toBe('Updated line 1');
    expect((screen.getAllByPlaceholderText('lyrics')[1] as HTMLTextAreaElement).value).toBe('Updated line 2 draft');

    const segmentGetCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes('/api/songs/song-1/segments') && (init?.method ?? 'GET') === 'GET'
    );
    expect(segmentGetCalls).toHaveLength(1);
  });

  it('probes the direct audio URL for duration before first play', async () => {
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: false,
      currentMs: 0,
      durationMs: 0,
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
      setPlaybackEndMs: vi.fn(),
    });

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            audioUrl: 'https://pub-example.r2.dev/audio/song-1/test.mp3',
            title: 'My Song',
          }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    const originalAudio = globalThis.Audio;

    class FallbackProbeAudio extends EventTarget {
      duration = 0;
      preload = 'none';
      src: string;

      constructor(src: string) {
        super();
        this.src = src;
      }

      load() {
        if (this.src === 'https://pub-example.r2.dev/audio/song-1/test.mp3') {
          this.duration = 180;
          this.dispatchEvent(new Event('loadedmetadata'));
          return;
        }

        this.dispatchEvent(new Event('error'));
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
        super.addEventListener(type, listener as EventListener);
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
        super.removeEventListener(type, listener as EventListener);
      }
    }

    vi.stubGlobal('Audio', FallbackProbeAudio as unknown as typeof Audio);

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('03:00').length).toBeGreaterThan(0);
    });

    vi.stubGlobal('Audio', originalAudio);
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.queryByTestId('segment-editor-playback-controls')).not.toBeInTheDocument();
      expect(screen.getByTestId('segment-editor-bottom-play-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-bottom-play-toggle'));
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-bottom-play-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-bottom-play-toggle'));
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
      setPlaybackEndMs: vi.fn(),
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-song-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('song-timeline-segment-seg-1')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('segment-editor-song-seek'), { target: { value: '15000' } });
    expect(seek).toHaveBeenCalledWith(15000);
  });

  it('seeks when clicking an empty area of the section board', async () => {
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
      setPlaybackEndMs: vi.fn(),
    });

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
    } as DOMRect);

    fireEvent.click(board, { clientX: 500 });

    expect(seek).toHaveBeenCalledWith(30000);
  });

  it('does not seek when clicking on a section block', async () => {
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    const segment = await screen.findByTestId('segment-block-seg-1');
    fireEvent.click(segment);

    expect(seek).not.toHaveBeenCalled();
  });

  it('saves selected label changes via patch on blur', async () => {
    render(<SegmentEditor songId="song-1" />);

    const segment = await screen.findByTestId('segment-block-seg-1');
    fireEvent.click(segment);
    fireEvent.click(screen.getByText('Section 1'));

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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/segments', expect.objectContaining({ cache: 'no-store' }));
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

  it('defaults the editor canvas to maximum zoom and allows zooming out', async () => {
    render(<SegmentEditor songId="song-1" />);

    const board = await screen.findByTestId('segment-editor-board');
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('400%');
    expect(board).toHaveStyle({ width: '400%' });

    fireEvent.click(screen.getByTestId('segment-editor-zoom-in'));
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('400%');
    expect(board).toHaveStyle({ width: '400%' });

    fireEvent.click(screen.getByTestId('segment-editor-zoom-out'));
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('350%');
    expect(board).toHaveStyle({ width: '350%' });
  });

  it('keeps the editor canvas in a touch-scrollable wrapper on mobile', async () => {
    render(<SegmentEditor songId="song-1" />);

    const boardScroll = await screen.findByTestId('segment-editor-board-scroll');
    expect(boardScroll).toHaveStyle({ touchAction: 'pan-x pinch-zoom' });
    expect(screen.getByTestId('segment-editor-board').className).not.toContain('touch-none');
  });

  it('supports pinch-to-zoom on the editor canvas', async () => {
    render(<SegmentEditor songId="song-1" />);

    const boardScroll = await screen.findByTestId('segment-editor-board-scroll');
    const board = screen.getByTestId('segment-editor-board');
    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('400%');

    fireEvent.touchStart(boardScroll, {
      touches: [
        { clientX: 40, clientY: 40 },
        { clientX: 140, clientY: 40 },
      ],
    });
    fireEvent.touchMove(boardScroll, {
      touches: [
        { clientX: 40, clientY: 40 },
        { clientX: 90, clientY: 40 },
      ],
    });

    expect(screen.getByTestId('segment-editor-zoom-label')).toHaveTextContent('200%');
    expect(board).toHaveStyle({ width: '200%' });

    fireEvent.touchEnd(boardScroll, {
      touches: [],
    });
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

  it('moves draft recording management into the editor audio section', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/songs/song-1') && !url.includes('/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            audioUrl: '/audio/song.mp3',
            title: 'My Song',
            draftRecordings: [
              {
                id: 'draft-1',
                songId: 'song-1',
                title: null,
                audioKey: 'audio/drafts/draft-1.webm',
                audioUrl: 'https://cdn.example.com/audio/drafts/draft-1.webm',
                status: 'draft',
                createdAt: '2026-05-25T14:30:00.000Z',
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/api/songs/song-1/segments') && method === 'GET') {
        return {
          ok: true,
          json: async () => sampleSegments,
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'Unexpected request' }),
      } as Response;
    });

    render(<SegmentEditor songId="song-1" />);

    fireEvent.click(await screen.findByTestId('segment-editor-replace-audio-toggle'));

    expect(await screen.findByTestId('segment-editor-draft-recordings')).toBeInTheDocument();
    expect(screen.getByText('Audio file')).toBeInTheDocument();
    expect(screen.getByText('Record a draft take')).toBeInTheDocument();
    expect(screen.getByText('Draft takes stay here until you discard them or promote one into a song version.')).toBeInTheDocument();
    expect(screen.getByTestId('draft-recordings')).toHaveTextContent('Draft recording 1');
    expect(screen.queryByTestId('draft-recording-toggle')).toBeInTheDocument();
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
      setPlaybackEndMs: vi.fn(),
    });

    render(<SegmentEditor songId="song-1" />);

    const playhead = await screen.findByTestId('segment-editor-canvas-playhead');
    // 10000 / 60000 ≈ 16.67% — just verify a non-zero left position is set
    const style = playhead.getAttribute('style') ?? '';
    expect(style).toMatch(/left/);
    expect(style).not.toBe('left: 0%');
  });

  it('does not expose the retired manual contour recorder', async () => {
    render(<SegmentEditor songId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('segment-editor-board')).toBeInTheDocument();
      expect(screen.getByTestId('segment-editor-midi-panel-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('segment-editor-midi-panel-toggle'));
    expect(screen.getByTestId('midi-setup-panel')).toBeInTheDocument();

    expect(screen.queryByTestId('segment-editor-contour-record-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-editor-contour-tapbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-editor-contour-save')).not.toBeInTheDocument();
  });
});
