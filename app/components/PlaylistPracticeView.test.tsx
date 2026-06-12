import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../types';
import * as audioPlayerHook from '../hooks/useAudioPlayer';
import { getAutoDrillPlaybackWarning, PlaylistPracticeView } from './PlaylistPracticeView';

const playlist: Playlist = {
  id: 'playlist-1',
  name: 'Morning Warmup',
  isRetired: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  songs: [
    {
      id: 'song-1',
      title: 'Alpha',
      artist: 'A',
      audioUrl: 'https://example.com/alpha.mp3',
      segments: [
        {
          id: 'seg-1',
          songId: 'song-1',
          order: 0,
          label: 'Section 1',
          lyricText: 'Alpha line',
          startMs: 0,
          endMs: 1000,
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      masteryPercent: 91,
      position: 0,
    },
    {
      id: 'song-2',
      title: 'Beta',
      artist: 'B',
      audioUrl: 'https://example.com/beta.mp3',
      segments: [
        {
          id: 'seg-2',
          songId: 'song-2',
          order: 0,
          label: 'Section 1',
          lyricText: 'Beta line',
          startMs: 0,
          endMs: 1000,
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      masteryPercent: 7,
      position: 1,
    },
  ],
};

describe('PlaylistPracticeView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.localStorage.setItem('playlist-practice-mode-explainer:focus', 'seen');
    window.localStorage.setItem('playlist-practice-mode-explainer:listen', 'seen');
    window.localStorage.setItem('playlist-practice-mode-explainer:auto', 'seen');
    Reflect.deleteProperty(window, 'caches');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('shows playlist name, knowledge score, and song cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Morning Warmup' })).toHaveClass('text-gray-900');
    expect(await screen.findByTestId('playlist-practice-score')).toHaveTextContent('Playlist Knowledge: 67%');
    expect(screen.getByTestId('playlist-practice-song-song-1')).toHaveTextContent('Alpha');
    expect(screen.getByRole('heading', { name: 'Alpha' })).toHaveClass('text-gray-900');
    expect(screen.getByTestId('playlist-practice-song-song-2')).toHaveTextContent('Beta');
    expect(screen.getByRole('button', { name: 'Hands Free' })).toBeInTheDocument();
  });

  it('shows a first-run explainer before entering Focus mode', async () => {
    window.localStorage.removeItem('playlist-practice-mode-explainer:focus');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));

    expect(screen.getByRole('heading', { name: 'Focus mode' })).toBeInTheDocument();
    expect(screen.queryByTestId('playlist-focus-queue')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('playlist-mode-explainer-continue'));

    await waitFor(() => {
      expect(screen.getByTestId('playlist-focus-queue')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('playlist-practice-mode-explainer:focus')).toBe('seen');
  });

  it('calls onSelectSong when a song card is clicked', async () => {
    const onSelectSong = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={onSelectSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-practice-song-song-1'));
    expect(onSelectSong).toHaveBeenCalledWith(expect.objectContaining({ id: 'song-1', title: 'Alpha' }));
  });

  it('calls onExit when back button is clicked', async () => {
    const onExit = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0.6 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={onExit} onSelectSong={() => undefined} />);

    fireEvent.click(await screen.findByTestId('playlist-practice-exit'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows empty state with manage button when playlist has no songs', async () => {
    const onManage = vi.fn();
    const emptyPlaylist: Playlist = { ...playlist, songs: [] };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={emptyPlaylist} onExit={() => undefined} onSelectSong={() => undefined} onManage={onManage} />);

    expect(screen.getByTestId('playlist-practice-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('playlist-practice-manage'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('keeps playlist header controls wrap-friendly on narrow screens when manage is available', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 25 }) }) as unknown as typeof fetch;

    render(
      <PlaylistPracticeView
        playlist={playlist}
        onExit={() => undefined}
        onSelectSong={() => undefined}
        onManage={() => undefined}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-score')).toBeInTheDocument();
    });

    const manageButton = screen.getByTestId('playlist-practice-manage');
    const controlsRow = manageButton.parentElement;
    expect(controlsRow?.className).toContain('flex-wrap');
    expect(controlsRow?.className).toContain('w-full');
    expect(manageButton.className).toContain('ml-auto');
  });

  it('shows readiness tags for songs missing audio and/or segments', async () => {
    const mixedPlaylist: Playlist = {
      ...playlist,
      songs: [
        playlist.songs[0],
        { ...playlist.songs[1], audioUrl: '' },
        {
          ...playlist.songs[1],
          id: 'song-3',
          title: 'Gamma',
          audioUrl: 'https://example.com/gamma.mp3',
          segments: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={mixedPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-practice-song-song-2')).toBeInTheDocument();
    expect(screen.getByTestId('playlist-practice-song-song-3')).toBeInTheDocument();

    expect(screen.getByTestId('playlist-practice-song-song-2-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio missing');
    expect(screen.getByTestId('playlist-practice-song-song-2-readiness-blend-audio')).toHaveAttribute('aria-label', 'Blend audio missing');
    expect(screen.getByTestId('playlist-practice-song-song-2-readiness-segments')).toHaveAttribute('aria-label', 'Sections present');
    expect(screen.getByTestId('playlist-practice-song-song-3-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio present');
    expect(screen.getByTestId('playlist-practice-song-song-3-readiness-segments')).toHaveAttribute('aria-label', 'Sections missing');
  });

  it('shows blend-only audio separately in readiness', async () => {
    const blendOnlyPlaylist: Playlist = {
      ...playlist,
      songs: [
        { ...playlist.songs[0], audioUrl: '', alternateAudioUrl: 'https://example.com/blend.mp3' },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={blendOnlyPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio missing');
      expect(screen.getByTestId('playlist-practice-song-song-1-readiness-blend-audio')).toHaveAttribute('aria-label', 'Blend audio present');
    });
  });

  it('shows both readiness tags when both audio and segments are missing', async () => {
    const notReadyPlaylist: Playlist = {
      ...playlist,
      songs: [
        { ...playlist.songs[0], audioUrl: '', segments: [] },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={notReadyPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio missing');
    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-blend-audio')).toHaveAttribute('aria-label', 'Blend audio missing');
    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-segments')).toHaveAttribute('aria-label', 'Sections missing');
  });

  it('shows weakest segments first in Focus mode with the normal practice surface and tap controls', async () => {
    const play = vi.fn();
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));

    const focusPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'seg-1', label: 'Opening', startMs: 4000, endMs: 7000 },
          ],
        },
        {
          ...playlist.songs[1],
          pitchContourNotes: [
            { id: 'note-1', absoluteMs: 12000, lane: 0.4, durationMs: 200 },
            { id: 'note-2', absoluteMs: 12500, lane: 0.6, durationMs: 200 },
          ],
          segments: [
            { ...playlist.songs[1].segments[0], id: 'seg-2', label: 'Second Chorus', startMs: 12000, endMs: 15000 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(focusPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return { ok: true, json: async () => ({ ratings: [{ id: 'rating-1', segmentId: 'seg-1', rating: 5, ratedAt: '2026-01-02T00:00:00.000Z' }] }) } as Response;
      }
      if (url.includes('/api/songs/song-2/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={focusPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Beta - B');
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Second Chorus');
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Song 2 of 2');
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Segment 1 of 1');
    });

    expect(screen.getByTestId('focus-practice-surface')).toBeInTheDocument();
    expect(screen.getByTestId('focus-practice-surface').className).toContain('min-h-0');
    expect(screen.getByTestId('focus-practice-surface').className).not.toContain('min-h-[720px]');
    expect(screen.getByTestId('segment-lyric-text')).toHaveStyle({ fontSize: 'clamp(2rem, 7vw, 4.5rem)' });
    expect(screen.getByTestId('song-title')).toHaveTextContent('Beta');
    expect(screen.getByTestId('segment-counter')).toHaveTextContent('Segment 1 of 1');
    expect(screen.getByTestId('practice-tap-mode-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('focus-prev-segment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('focus-next-segment')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('audio-play-pause'));

    expect(play).toHaveBeenCalledWith(7000, 15000);
  });

  it('uses the practice segment arrows to move through the Focus queue', async () => {
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));

    const focusPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'seg-1', label: 'Alpha Verse', order: 0, startMs: 4000, endMs: 7000 },
          ],
        },
        {
          ...playlist.songs[1],
          segments: [
            { ...playlist.songs[1].segments[0], id: 'seg-2', label: 'Beta Chorus', order: 0, startMs: 12000, endMs: 15000 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(focusPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/songs/song-2/ratings')) {
        return { ok: true, json: async () => ({ ratings: [{ id: 'rating-2', segmentId: 'seg-2', rating: 1, ratedAt: '2026-01-02T00:00:00.000Z' }] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={focusPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));
    fireEvent.click(await screen.findByTestId('focus-sort-song-order'));

    expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Alpha Verse');
    expect(screen.getByTestId('practice-prev-segment')).toBeDisabled();

    fireEvent.click(screen.getByTestId('practice-next-segment'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Beta Chorus');
      expect(screen.getByTestId('song-title')).toHaveTextContent('Beta');
    });

    fireEvent.click(screen.getByTestId('practice-prev-segment'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Alpha Verse');
      expect(screen.getByTestId('song-title')).toHaveTextContent('Alpha');
    });
  });

  it('keeps Focus queue cards scrollable above the fixed playbar and uses descriptive card labels', async () => {
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));

    const focusPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'seg-1', label: 'Alpha Verse', order: 0, startMs: 4000, endMs: 7000 },
            { ...playlist.songs[0].segments[0], id: 'seg-2', label: 'Alpha Bridge', order: 1, startMs: 8000, endMs: 11000 },
            { ...playlist.songs[0].segments[0], id: 'seg-3', label: 'Alpha Tag', order: 2, startMs: 12000, endMs: 15000 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(focusPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return {
          ok: true,
          json: async () => ({
            ratings: [
              { id: 'rating-1', segmentId: 'seg-1', rating: 5, ratedAt: '2026-01-02T00:00:00.000Z' },
              { id: 'rating-2', segmentId: 'seg-2', rating: 5, ratedAt: '2026-01-02T00:00:00.000Z' },
              { id: 'rating-3', segmentId: 'seg-3', rating: 3, ratedAt: '2026-01-02T00:00:00.000Z' },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={focusPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));

    const focusQueue = await screen.findByTestId('playlist-focus-queue');
    const practiceMain = await screen.findByTestId('practice-main');
    const segmentCard = await screen.findByTestId('focus-queue-item-seg-3');

    expect(focusQueue).toHaveStyle({
      paddingBottom: 'calc(var(--player-height) + env(safe-area-inset-bottom) + 16px)',
    });
    expect(practiceMain).toHaveStyle({
      paddingBottom: 'calc(var(--player-height) + env(safe-area-inset-bottom) + 8px)',
    });
    expect(segmentCard).toHaveTextContent('Segment 3');
    expect(segmentCard).toHaveTextContent('Alpha - 00:12');
    expect(segmentCard).toHaveTextContent('60% memorized');
  });

  it('keeps Focus queue playback running when moving to the next segment', async () => {
    const play = vi.fn();
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: true,
      isReady: true,
      currentMs: 5000,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
        hasUserPlayIntent: true,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'playing',
        lastEventAt: new Date().toISOString(),
        playAttempts: 1,
        errorCode: null,
        errorMessage: null,
      },
      play,
      pause: vi.fn(),
      seek: vi.fn(),
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));

    const focusPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'seg-1', label: 'Alpha Verse', order: 0, startMs: 4000, endMs: 7000 },
          ],
        },
        {
          ...playlist.songs[1],
          segments: [
            { ...playlist.songs[1].segments[0], id: 'seg-2', label: 'Beta Chorus', order: 0, startMs: 12000, endMs: 15000 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(focusPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings') || url.includes('/api/songs/song-2/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={focusPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));
    fireEvent.click(await screen.findByTestId('focus-sort-song-order'));

    play.mockClear();

    fireEvent.click(screen.getByTestId('practice-next-segment'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Beta Chorus');
      expect(play).toHaveBeenCalledWith(7000, 15000);
    });
  });

  it('groups weakest Focus Queue segments by song while preserving song segment order', async () => {
    const groupedPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'a-verse', label: 'A Verse', order: 0, startMs: 1000, endMs: 2000 },
            { ...playlist.songs[0].segments[0], id: 'a-chorus', label: 'A Chorus', order: 1, startMs: 3000, endMs: 4000 },
          ],
        },
        {
          ...playlist.songs[1],
          segments: [
            { ...playlist.songs[1].segments[0], id: 'b-intro', label: 'B Intro', order: 0, startMs: 500, endMs: 900 },
            { ...playlist.songs[1].segments[0], id: 'b-verse', label: 'B Verse', order: 1, startMs: 1000, endMs: 2000 },
            { ...playlist.songs[1].segments[0], id: 'b-chorus', label: 'B Chorus', order: 2, startMs: 3000, endMs: 4000 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(groupedPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return {
          ok: true,
          json: async () => ({
            ratings: [
              { id: 'a-verse-rating', segmentId: 'a-verse', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
              { id: 'a-chorus-rating', segmentId: 'a-chorus', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
            ],
          }),
        } as Response;
      }
      if (url.includes('/api/songs/song-2/ratings')) {
        return {
          ok: true,
          json: async () => ({
            ratings: [
              { id: 'b-intro-rating', segmentId: 'b-intro', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
              { id: 'b-verse-rating', segmentId: 'b-verse', rating: 2, ratedAt: '2026-01-01T00:00:00.000Z' },
              { id: 'b-chorus-rating', segmentId: 'b-chorus', rating: 1, ratedAt: '2026-01-01T00:00:00.000Z' },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={groupedPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('B Verse');
      expect(screen.getByTestId('focus-current-segment')).not.toHaveTextContent('B Intro');
    });

    fireEvent.click(screen.getByTestId('practice-next-segment'));

    await waitFor(() => {
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('B Chorus');
    });
  });

  it('does not include 5-rated segments in the Focus Queue', async () => {
    const masteredPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'mastered-segment', label: 'Mastered Verse', order: 0 },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 100 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(masteredPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return {
          ok: true,
          json: async () => ({
            ratings: [
              { id: 'mastered-rating', segmentId: 'mastered-segment', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={masteredPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));

    await waitFor(() => {
      expect(screen.getByText('No segments currently need focused practice.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mastered Verse')).not.toBeInTheDocument();
  });

  it('saves Focus Queue ratings without auto-advancing to the next segment', async () => {
    const focusPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            { ...playlist.songs[0].segments[0], id: 'seg-1', label: 'Verse', order: 0 },
            { ...playlist.songs[0].segments[0], id: 'seg-1b', label: 'Chorus', order: 1, startMs: 2000, endMs: 3000 },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 0 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(focusPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/songs/song-1/ratings') && init?.method === 'POST') {
        return { ok: true } as Response;
      }
      if (url.includes('/api/songs/song-1/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={focusPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-focus'));
    fireEvent.click(await screen.findByTestId('focus-sort-song-order'));

    expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Verse');

    fireEvent.click(screen.getByTestId('rating-button-4'));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          return (
            url.includes('/api/songs/song-1/ratings') &&
            init?.method === 'POST' &&
            typeof init.body === 'string' &&
            init.body.includes('"segmentId":"seg-1"')
          );
        })
      ).toBe(true);
      expect(screen.getByTestId('focus-current-segment')).toHaveTextContent('Verse');
    }, { timeout: 2000 });
  });

  it('plays from the listen transport without auto-starting on mode entry', async () => {
    const play = vi.fn();
    const pause = vi.fn();
    const seek = vi.fn();

    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(() => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: playlist.songs[0].audioUrl,
        currentSrc: playlist.songs[0].audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      pause,
      seek,
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    const { rerender } = render(
      <PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />
    );

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));

    expect(play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(0, 0);

    rerender(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('treats songs without audio as zero-length in listen mode and continues', async () => {
    const play = vi.fn();

    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));

    const mixedPlaylist: Playlist = {
      ...playlist,
      songs: [
        { ...playlist.songs[0], audioUrl: '' },
        { ...playlist.songs[1], audioUrl: '/audio/song-2/beta.mp3' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={mixedPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
      expect(play).toHaveBeenCalledWith(0, 0);
    });
  });

  it('advances to the next playable song when the current song ends', async () => {
    let started = false;
    const play = vi.fn(() => {
      started = true;
    });
    let endedCount = 0;

    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: started && endedCount === 0,
      isReady: true,
      currentMs: endedCount === 0 ? 11000 : 0,
      durationMs: 12000,
      endedCount,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: endedCount > 0 ? 'ended' : 'playing',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play,
      pause: vi.fn(),
      seek: vi.fn(),
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    const view = render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();

    endedCount = 1;
    view.rerender(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    });
  });

  it('refreshes stale playlist song readiness from playlist detail in the background', async () => {
    const stalePlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          audioUrl: '',
          segments: [],
        },
      ],
    };
    const freshPlaylist: Playlist = {
      ...stalePlaylist,
      songs: [
        {
          ...stalePlaylist.songs[0],
          audioUrl: 'https://example.com/fresh-alpha.mp3',
          segments: playlist.songs[0].segments,
        },
      ],
    };

    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        open: vi.fn().mockResolvedValue(cache),
      },
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(freshPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={stalePlaylist} userId="user-1" onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio missing');
    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-segments')).toHaveAttribute('aria-label', 'Sections missing');

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1-readiness-part-audio')).toHaveAttribute('aria-label', 'Part audio present');
      expect(screen.getByTestId('playlist-practice-song-song-1-readiness-segments')).toHaveAttribute('aria-label', 'Sections present');
    });

    expect(cache.put).toHaveBeenCalled();
  });

  it('uses direct playable audio URLs for listen mode playback', async () => {
    const useAudioPlayerSpy = vi.spyOn(audioPlayerHook, 'useAudioPlayer');

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(useAudioPlayerSpy).toHaveBeenCalledWith('https://example.com/alpha.mp3');
    });

    const r2Playlist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          audioUrl: 'https://pub-example.r2.dev/audio/song-1/test.mp3',
        },
      ],
    };

    render(<PlaylistPracticeView playlist={r2Playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(useAudioPlayerSpy).toHaveBeenCalledWith('https://pub-example.r2.dev/audio/song-1/test.mp3');
    });
  });

  it('uses preferred blend audio for listen playback and falls back to part audio', async () => {
    const useAudioPlayerSpy = vi.spyOn(audioPlayerHook, 'useAudioPlayer');
    const mixedAudioPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          alternateAudioUrl: 'https://example.com/alpha-blend.mp3',
        },
        playlist.songs[1],
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(
      <PlaylistPracticeView
        playlist={mixedAudioPlaylist}
        preferredAudioVersion="blend"
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    await waitFor(() => {
      expect(useAudioPlayerSpy).toHaveBeenCalledWith('https://example.com/alpha-blend.mp3');
    });

    fireEvent.click(screen.getByTestId('playlist-mode-listen'));
    fireEvent.click(screen.getByLabelText('Next song'));

    await waitFor(() => {
      expect(useAudioPlayerSpy).toHaveBeenCalledWith('https://example.com/beta.mp3');
    });
  });

  it('keeps listen playback position when switching between part and blend audio', async () => {
    let started = false;
    const play = vi.fn(() => {
      started = true;
    });
    const pause = vi.fn(() => {
      started = false;
    });
    const seek = vi.fn();
    const useAudioPlayerSpy = vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: started,
      isReady: true,
      currentMs: started ? 4200 : 0,
      durationMs: 12000,
      endedCount: 0,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
        hasUserPlayIntent: true,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'playing',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play,
      pause,
      seek,
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));
    const mixedAudioPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          alternateAudioUrl: 'https://example.com/alpha-blend.mp3',
        },
      ],
    };
    let preferredAudioVersion: 'part' | 'blend' = 'part';
    const onPreferredAudioVersionChange = vi.fn((version: 'part' | 'blend') => {
      preferredAudioVersion = version;
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    const view = render(
      <PlaylistPracticeView
        playlist={mixedAudioPlaylist}
        preferredAudioVersion={preferredAudioVersion}
        onPreferredAudioVersionChange={onPreferredAudioVersionChange}
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    fireEvent.click(screen.getByTestId('playlist-mode-listen'));
    fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));
    expect(play).toHaveBeenCalledWith(0, 0);

    view.rerender(
      <PlaylistPracticeView
        playlist={mixedAudioPlaylist}
        preferredAudioVersion={preferredAudioVersion}
        onPreferredAudioVersionChange={onPreferredAudioVersionChange}
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    fireEvent.click(screen.getByTestId('playlist-audio-preference-blend'));
    expect(pause).toHaveBeenCalled();
    expect(onPreferredAudioVersionChange).toHaveBeenCalledWith('blend');

    view.rerender(
      <PlaylistPracticeView
        playlist={mixedAudioPlaylist}
        preferredAudioVersion={preferredAudioVersion}
        onPreferredAudioVersionChange={onPreferredAudioVersionChange}
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    await waitFor(() => {
      expect(useAudioPlayerSpy).toHaveBeenCalledWith('https://example.com/alpha-blend.mp3');
      expect(seek).toHaveBeenCalledWith(4200);
      expect(play).toHaveBeenLastCalledWith(4200, 0);
    });
  });

  it('does not fall back to the proxy URL when direct listen playback reports an error', async () => {
    const useAudioPlayerSpy = vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackRate: 1,
      playbackError: audioUrl.startsWith('https://') ? 'Unable to load audio' : null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));

    const fallbackPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          audioUrl: 'https://cantare-audio.r2.dev/users/default/audio/song-1/test%20file.mp3',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={fallbackPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      const args = useAudioPlayerSpy.mock.calls.map((call) => String(call[0]));
      expect(args).toContain('https://cantare-audio.r2.dev/users/default/audio/song-1/test%20file.mp3');
      expect(args).not.toContain('/api/audio/users/default/audio/song-1/test%20file.mp3');
    });
  });

  it('places mastery label inside the bar at 10% or higher and outside when below 10%', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    const insideLabel = screen.getByTestId('playlist-practice-mastery-label-song-1');
    expect(insideLabel).toHaveTextContent('91%');
    expect(insideLabel.className).toContain('text-white');

    const outsideLabel = screen.getByTestId('playlist-practice-mastery-label-song-2');
    expect(outsideLabel).toHaveTextContent('7%');
    expect(outsideLabel.className).toContain('text-gray-700');
  });

  it('shows clean local-only progress on guest shared playlist cards', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;
    const ownerProgressPlaylist: Playlist = {
      ...playlist,
      songs: playlist.songs.map((song, index) => ({
        ...song,
        masteryPercent: index === 0 ? 91 : 40,
        lastPracticedAt: index === 0 ? '2026-05-18T00:00:00.000Z' : '2026-05-23T00:00:00.000Z',
      })),
    };

    render(
      <PlaylistPracticeView
        playlist={ownerProgressPlaylist}
        persistProgress={false}
        progressStorage="local"
        revalidatePlaylist={false}
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-practice-mastery-label-song-1')).toHaveTextContent('0%');
    expect(screen.getByTestId('playlist-practice-mastery-label-song-2')).toHaveTextContent('0%');
    expect(screen.getByTestId('playlist-practice-song-song-1')).toHaveTextContent('Not practiced yet');
    expect(screen.getByTestId('playlist-practice-song-song-2')).toHaveTextContent('Not practiced yet');
  });

  it('plays unrated Auto Drill segments three times and advances on a high rating', async () => {
    const play = vi.fn();
    let latestAudioOptions: { onRangeEnd?: () => void } | undefined;
    const audioState = {
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    };
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(((_audioUrl: string, _factory?: unknown, options?: { onRangeEnd?: () => void }) => {
      latestAudioOptions = options;
      return audioState;
    }) as typeof audioPlayerHook.useAudioPlayer);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (init?.method === 'POST' && url.includes('/api/songs/song-2/ratings')) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(play).toHaveBeenCalledWith(0, 1000);
    });
    expect(screen.getByTestId('practice-prev-segment')).toBeDisabled();
    expect(screen.getByTestId('practice-next-segment')).not.toBeDisabled();
    expect(screen.queryByTestId('audio-skip-back')).not.toBeInTheDocument();

    for (let expectedPlayCount = 2; expectedPlayCount <= 3; expectedPlayCount += 1) {
      act(() => {
        latestAudioOptions?.onRangeEnd?.();
      });

      await waitFor(() => {
        expect(play).toHaveBeenCalledTimes(expectedPlayCount);
      });
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Alpha');
      expect(screen.getByTestId('auto-drill-live')).not.toHaveTextContent('Rate your recall from 1 to 5.');
    }

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Beta');
      expect(play).toHaveBeenCalledTimes(4);
    });

    fireEvent.click(screen.getByTestId('rating-button-5'));
    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-live')).toHaveTextContent('Rated 5.');
    });
    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-live')).toHaveTextContent('Playlist complete.');
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => {
        const [input, init] = call;
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return url === '/api/songs/song-2/ratings' && init?.method === 'POST';
      })).toBe(true);
    });
  });

  it('repeats a rating-2 Auto Drill segment three total plays before advancing', async () => {
    const play = vi.fn();
    let latestAudioOptions: { onRangeEnd?: () => void } | undefined;
    const audioState = {
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    };
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(((_audioUrl: string, _factory?: unknown, options?: { onRangeEnd?: () => void }) => {
      latestAudioOptions = options;
      return audioState;
    }) as typeof audioPlayerHook.useAudioPlayer);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(play).toHaveBeenCalledWith(0, 1000);
    });

    fireEvent.keyDown(window, { key: '2' });

    for (let expectedPlayCount = 2; expectedPlayCount <= 3; expectedPlayCount += 1) {
      act(() => {
        latestAudioOptions?.onRangeEnd?.();
      });

      await waitFor(() => {
        expect(play).toHaveBeenCalledTimes(expectedPlayCount);
      });
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Alpha');
    }

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Beta');
      expect(play).toHaveBeenCalledTimes(4);
    });
  });

  it('continues through consecutive rating-5 Auto Drill segments without a prompt or preroll', async () => {
    const oneSongPlaylist: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          segments: [
            {
              id: 'song-1-seg-1',
              songId: 'song-1',
              order: 0,
              label: 'First',
              lyricText: 'First line',
              startMs: 0,
              endMs: 1000,
            },
            {
              id: 'song-1-seg-2',
              songId: 'song-1',
              order: 1,
              label: 'Second',
              lyricText: 'Second line',
              startMs: 1000,
              endMs: 2000,
            },
            {
              id: 'song-1-seg-3',
              songId: 'song-1',
              order: 2,
              label: 'Third',
              lyricText: 'Third line',
              startMs: 2000,
              endMs: 3000,
            },
          ],
        },
      ],
    };
    const play = vi.fn();
    let latestAudioOptions: { onRangeEnd?: () => void } | undefined;
    const audioState = {
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    };
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(((_audioUrl: string, _factory?: unknown, options?: { onRangeEnd?: () => void }) => {
      latestAudioOptions = options;
      return audioState;
    }) as typeof audioPlayerHook.useAudioPlayer);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/song-1/ratings')) {
        return {
          ok: true,
          json: async () => ({
            ratings: [
              { id: 'rating-1', segmentId: 'song-1-seg-1', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
              { id: 'rating-2', segmentId: 'song-1-seg-2', rating: 5, ratedAt: '2026-01-01T00:00:00.000Z' },
              { id: 'rating-3', segmentId: 'song-1-seg-3', rating: 4, ratedAt: '2026-01-01T00:00:00.000Z' },
            ],
          }),
        } as Response;
      }
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 93 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(oneSongPlaylist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={oneSongPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));
    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some(([input]) => input === '/api/songs/song-1/ratings')).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('First');
      expect(play).toHaveBeenCalledWith(0, 1000);
    });

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Second');
      expect(screen.getByTestId('auto-drill-live')).toHaveTextContent('Playing Second.');
      expect(play).toHaveBeenCalledWith(1000, 2000);
      expect(play).toHaveBeenCalledTimes(2);
    });

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Third');
      expect(play).toHaveBeenCalledWith(2000, 3000);
      expect(play).toHaveBeenCalledTimes(3);
    });
  });

  it('keeps hands-free Auto Drill silent', async () => {
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak,
      },
    });
    const play = vi.fn();
    let latestAudioOptions: { onRangeEnd?: () => void } | undefined;
    const audioState = {
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    };
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(((_audioUrl: string, _factory?: unknown, options?: { onRangeEnd?: () => void }) => {
      latestAudioOptions = options;
      return audioState;
    }) as typeof audioPlayerHook.useAudioPlayer);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(play).toHaveBeenCalledWith(0, 1000);
    });

    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByTestId('auto-drill-voice-toggle')).not.toBeInTheDocument();

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
    });
    expect(speak).not.toHaveBeenCalled();
  });

  it('uses card arrows for Auto Drill navigation and restarts the target card loop count', async () => {
    const play = vi.fn();
    let latestAudioOptions: { onRangeEnd?: () => void } | undefined;
    const audioState = {
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    };
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(((_audioUrl: string, _factory?: unknown, options?: { onRangeEnd?: () => void }) => {
      latestAudioOptions = options;
      return audioState;
    }) as typeof audioPlayerHook.useAudioPlayer);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1/knowledge')) {
        return { ok: true, json: async () => ({ score: 67 }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Alpha');
    });

    expect(screen.getByTestId('practice-prev-segment')).toBeDisabled();
    fireEvent.click(screen.getByTestId('practice-next-segment'));

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Beta');
      expect(play).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('practice-prev-segment')).not.toBeDisabled();
    expect(screen.getByTestId('practice-next-segment')).toBeDisabled();

    fireEvent.click(screen.getByTestId('practice-prev-segment'));

    let playsAfterReturning = 0;
    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Alpha');
      expect(play.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    playsAfterReturning = play.mock.calls.length;

    act(() => {
      latestAudioOptions?.onRangeEnd?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-current-segment')).toHaveTextContent('Alpha');
      expect(play).toHaveBeenCalledTimes(playsAfterReturning + 1);
    });
  });

  it('continues Auto Drill when speech synthesis never reports completion', async () => {
    vi.useFakeTimers();
    class MockSpeechSynthesisUtterance {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn(),
      },
    });

    const play = vi.fn();
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({ score: 67 }) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    try {
      fireEvent.click(screen.getByTestId('playlist-mode-auto'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(play).toHaveBeenCalledWith(0, 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues Auto Drill when speech synthesis is denied by the browser', async () => {
    class MockSpeechSynthesisUtterance {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn(() => {
          throw new Error('The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.');
        }),
      },
    });

    const play = vi.fn();
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({ score: 67 }) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(screen.getByTestId('auto-drill-live')).toHaveTextContent('Playing Section 1.');
      expect(play).toHaveBeenCalledWith(0, 1000);
    });
    expect(screen.getByTestId('auto-drill-live')).not.toHaveTextContent('request is not allowed');
  });

  it('sanitizes mobile permission errors shown in the Auto Drill warning banner', () => {
    const rawPermissionMessage =
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.';

    const warning = getAutoDrillPlaybackWarning(rawPermissionMessage);

    expect(warning).toContain('Automatic audio is blocked');
    expect(warning).not.toContain('request is not allowed');
  });

  it('retries Hands Free with alternate audio when the preferred recording fails', async () => {
    const onPreferredAudioVersionChange = vi.fn();
    const playlistWithAlternate: Playlist = {
      ...playlist,
      songs: [
        {
          ...playlist.songs[0],
          alternateAudioUrl: 'https://example.com/alpha-blend.mp3',
        },
      ],
    };

    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation((audioUrl: string) => ({
      isPlaying: false,
      isReady: false,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: audioUrl.endsWith('alpha.mp3') ? 'Unable to load audio (code 4)' : null,
      debugInfo: {
        src: audioUrl,
        currentSrc: audioUrl,
        readyState: 0,
        networkState: 3,
        preload: 'metadata',
        hasUserPlayIntent: true,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'error',
        lastEventAt: new Date().toISOString(),
        playAttempts: 1,
        errorCode: 4,
        errorMessage: null,
      },
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlistWithAlternate), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({ score: 67 }) } as Response;
    }) as unknown as typeof fetch;

    render(
      <PlaylistPracticeView
        playlist={playlistWithAlternate}
        preferredAudioVersion="part"
        onPreferredAudioVersionChange={onPreferredAudioVersionChange}
        onExit={() => undefined}
        onSelectSong={() => undefined}
      />
    );

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));

    await waitFor(() => {
      expect(onPreferredAudioVersionChange).toHaveBeenCalledWith('blend');
    }, { timeout: 3000 });
    expect(screen.getByTestId('auto-drill-playback-warning')).toHaveTextContent(
      'Part audio could not load. Retrying with Blend audio.'
    );
  });

  it('exits Auto Drill with Escape', async () => {
    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(() => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 30000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: '',
        currentSrc: '',
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
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
      setPlaybackRate: vi.fn(),
    }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/songs/') && url.includes('/ratings')) {
        return { ok: true, json: async () => ({ ratings: [] }) } as Response;
      }
      if (url.includes('/api/playlists/playlist-1')) {
        return new Response(JSON.stringify(playlist), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { ok: true, json: async () => ({ score: 67 }) } as Response;
    }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    fireEvent.click(screen.getByTestId('playlist-mode-auto'));
    await waitFor(() => expect(screen.getByTestId('playlist-auto-drill')).toBeInTheDocument());
    expect(screen.getByTestId('auto-drill-practice-surface').className).toContain('min-h-0');
    expect(screen.getByTestId('auto-drill-practice-surface').className).not.toContain('min-h-[720px]');
    expect(screen.getByTestId('segment-lyric-text')).toHaveStyle({ fontSize: 'clamp(2rem, 7vw, 4.5rem)' });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-grid')).toBeInTheDocument();
    });
  });
});
