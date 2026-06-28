import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

const practiceViewMock = vi.fn();
const playlistBrowserMock = vi.fn();
const contourReferenceViewMock = vi.fn();

const samplePlaylist = {
  id: 'playlist-1',
  name: 'Set A',
  isRetired: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  songs: [
    {
      id: 'song-1',
      title: 'Song One',
      artist: 'Artist One',
      audioUrl: 'https://example.com/one.mp3',
      segments: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      position: 0,
    },
  ],
};

vi.mock('./components/PracticeView', () => ({
  default: ({
    song,
    breadcrumbRootLabel,
    onBreadcrumbRootClick,
    onEditSongClick,
    onOpenContourReferenceClick,
    segmentPrerollMs,
    preferredAudioVersion,
    onPreferredAudioVersionChange,
  }: {
    song: { segments: Array<unknown> };
    breadcrumbRootLabel?: string;
    onBreadcrumbRootClick?: () => void;
    onEditSongClick?: () => void;
    onOpenContourReferenceClick?: () => void;
    segmentPrerollMs?: number;
    preferredAudioVersion?: 'part' | 'blend';
    onPreferredAudioVersionChange?: (version: 'part' | 'blend') => void;
  }) => {
    practiceViewMock({ song, segmentPrerollMs, preferredAudioVersion });
    return (
      <div data-testid="mock-practice-view">
        Segments: {song.segments.length}
        <button data-testid="mock-prefer-blend" onClick={() => onPreferredAudioVersionChange?.('blend')}>
          Prefer Blend
        </button>
        {breadcrumbRootLabel ? (
          <button onClick={onBreadcrumbRootClick}>{breadcrumbRootLabel}</button>
        ) : null}
        {onEditSongClick ? (
          <button aria-label="Edit song" onClick={onEditSongClick}>Edit</button>
        ) : null}
        {onOpenContourReferenceClick ? (
          <button aria-label="Open contour reference" onClick={onOpenContourReferenceClick}>Contours</button>
        ) : null}
      </div>
    );
  },
}));

vi.mock('./components/SongContourReferenceView', () => ({
  SongContourReferenceView: ({ song, breadcrumbLabel, onBack }: { song: { title: string }; breadcrumbLabel?: string; onBack: () => void }) => {
    contourReferenceViewMock({ song, breadcrumbLabel });
    return (
      <div data-testid="mock-contour-reference-view">
        Contours for {song.title}
        <button data-testid="mock-contour-reference-back" onClick={onBack}>Back</button>
      </div>
    );
  },
}));

vi.mock('./components/SegmentEditor', () => ({
  SegmentEditor: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="mock-segment-editor">
      <button data-testid="mock-segment-editor-back" onClick={onBack}>
        Back to Practice
      </button>
    </div>
  ),
}));

vi.mock('./components/SongForm', () => ({
  SongForm: ({ onSuccess }: { onSuccess: (songId: string) => void }) => (
    <button data-testid="mock-song-form-success" onClick={() => onSuccess('song-1')}>
      Submit Song
    </button>
  ),
}));

vi.mock('./components/SongBrowser', () => ({
  SongBrowser: ({ onSelectSong }: { onSelectSong: (song: any) => void }) => (
    <button
      data-testid="mock-select-song"
      onClick={() => onSelectSong({ id: 'song-1', title: 'Song One', createdAt: '2025-01-01T00:00:00.000Z' })}
    >
      Select Song
    </button>
  ),
}));

vi.mock('./components/PlaylistBrowser', () => ({
  PlaylistBrowser: ({
    onSelectPlaylist,
    onManagePlaylist,
    userId,
  }: {
    onSelectPlaylist: (playlist: any) => void;
    onManagePlaylist: (playlist: any) => void;
    userId?: string;
  }) => {
    playlistBrowserMock({ userId });
    return (
      <div data-testid="mock-playlist-browser">
        <button data-testid="mock-playlist-practice" onClick={() => onSelectPlaylist(samplePlaylist)}>
          Practice Playlist
        </button>
        <button data-testid="mock-playlist-manage" onClick={() => onManagePlaylist(samplePlaylist)}>
          Manage Playlist
        </button>
      </div>
    );
  },
}));

vi.mock('./components/SharedBrowser', () => ({
  SharedBrowser: () => <div data-testid="mock-shared-browser">Shared playlists</div>,
}));

vi.mock('./components/PlaylistDetail', () => ({
  PlaylistDetail: ({ onPractice, onBack }: { onPractice: (playlist: any) => void; onBack: () => void; onEditSong?: (songId: string) => void }) => (
    <div data-testid="mock-playlist-detail">
      <button data-testid="mock-detail-practice" onClick={() => onPractice(samplePlaylist)}>
        Start Practice
      </button>
      <button data-testid="mock-detail-back" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock('./components/PlaylistPracticeView', () => ({
  PlaylistPracticeView: ({ onExit, onSelectSong }: { onExit: () => void; onSelectSong?: (song: { id: string; title: string; artist?: string; audioUrl: string; segments: unknown[]; createdAt: string }) => void }) => (
    <div data-testid="mock-playlist-practice-view">
      <button
        data-testid="mock-playlist-select-song"
        onClick={() =>
          onSelectSong?.({
            id: 'song-1',
            title: 'Song One',
            artist: 'Artist One',
            audioUrl: 'https://example.com/one.mp3',
            segments: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          })
        }
      >
        Select Playlist Song
      </button>
      <button data-testid="mock-playlist-exit" onClick={onExit}>
        Exit Playlist
      </button>
    </div>
  ),
}));

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    practiceViewMock.mockReset();
    playlistBrowserMock.mockReset();
    contourReferenceViewMock.mockReset();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'song-1',
        title: 'Song One',
        artist: 'Artist One',
        audioUrl: 'https://example.com/one.mp3',
        segments: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    }) as unknown as typeof fetch;
  });

  it('shows playlists by default and opens song practice when selecting a song from library', async () => {
    render(<Home />);

    expect(screen.getByText('Cantare Music (Guest)')).toBeInTheDocument();
    expect(screen.queryByText('Cantare')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-playlist-browser')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });
  });

  it('does not use a cached non-guest user while the tab is unauthenticated', async () => {
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: '' },
      ],
    }));
    document.cookie = 'cantare-user-id=test-user; path=/';
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({ user: null, actor: null, effectiveUser: null, isImpersonating: false }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    render(<Home />);

    expect(screen.getByText('Cantare Music (Guest)')).toBeInTheDocument();
    await waitFor(() => {
      const lastCall = playlistBrowserMock.mock.calls.at(-1)?.[0] as { userId?: string } | undefined;
      expect(lastCall?.userId).toMatch(/^guest-/);
    });
    expect(
      playlistBrowserMock.mock.calls.some(([call]) => (call as { userId?: string }).userId === 'test-user')
    ).toBe(false);
  });

  it('trusts a previously authenticated local user immediately when session hydration is offline', async () => {
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
      ],
    }));
    document.cookie = 'cantare-user-id=test-user; path=/';
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    render(<Home />);

    expect(screen.getByText('Cantare Music')).toBeInTheDocument();
    expect(screen.queryByText('Cantare Music (Guest)')).not.toBeInTheDocument();
    expect(playlistBrowserMock.mock.calls.at(-1)?.[0]).toEqual({ userId: 'test-user' });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' });
    });
    expect(screen.getByText('Cantare Music')).toBeInTheDocument();
  });

  it('falls back to a guest after an online session check rejects a cached authenticated user', async () => {
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
      ],
    }));
    document.cookie = 'cantare-user-id=test-user; path=/';
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({ user: null, actor: null, effectiveUser: null, isImpersonating: false }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    render(<Home />);

    expect(screen.getByText('Cantare Music')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Cantare Music (Guest)')).toBeInTheDocument();
    });
  });

  it('falls back to playlists when the hash view is missing or invalid', async () => {
    window.history.replaceState(null, '', '/#view=unknown');

    render(<Home />);

    expect(await screen.findByTestId('mock-playlist-browser')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-select-song')).not.toBeInTheDocument();
  });

  it('allows updating segment preroll from settings panel', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('home-settings-toggle'));
    expect(screen.getByTestId('settings-panel')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('settings-scroll-body')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('settings-section-playback')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByTestId('settings-section-playback-toggle'));
    const slider = screen.getByTestId('segment-preroll-slider');
    fireEvent.change(slider, { target: { value: '1000' } });

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });

    const lastCall = practiceViewMock.mock.calls.at(-1)?.[0] as { segmentPrerollMs?: number } | undefined;
    expect(lastCall?.segmentPrerollMs).toBe(1000);
  });

  it('uses the selected default audio preference in practice', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('home-settings-toggle'));
    fireEvent.click(screen.getByTestId('settings-section-playback-toggle'));
    fireEvent.click(screen.getByTestId('settings-audio-preference-blend'));

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });

    const lastCall = practiceViewMock.mock.calls.at(-1)?.[0] as { preferredAudioVersion?: 'part' | 'blend' } | undefined;
    expect(lastCall?.preferredAudioVersion).toBe('blend');
  });

  it('shows build information in settings and omits compact lyric wrapping', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('home-settings-toggle'));

    expect(screen.queryByTestId('settings-collapse-line-breaks-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-build')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByTestId('settings-section-build-toggle'));
    expect(screen.getByTestId('settings-build-version')).toHaveTextContent(/^v\d+\.\d+\.\d+/);
    expect(screen.getByTestId('settings-build-branch')).toBeInTheDocument();
  });

  it('switches to playlists and starts playlist practice', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('playlists-tab'));
    expect(await screen.findByTestId('mock-playlist-browser')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-playlist-practice'));
    expect(await screen.findByTestId('mock-playlist-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-playlist-exit'));
    expect(await screen.findByTestId('mock-playlist-browser')).toBeInTheDocument();
  });

  it('opens playlist detail from playlists tab and starts playlist practice from detail', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('playlists-tab'));
    fireEvent.click(await screen.findByTestId('mock-playlist-manage'));

    expect(await screen.findByTestId('mock-playlist-detail')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-detail-practice'));

    expect(await screen.findByTestId('mock-playlist-practice-view')).toBeInTheDocument();
  });

  it('refreshes the selected song before returning from edit mode', async () => {
    let songFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/draft-recordings') {
        return { ok: true, json: async () => ({ draftRecordings: [] }) };
      }
      if (url === '/api/songs') {
        return { ok: true, json: async () => [] };
      }
      if (url === '/api/songs/song-1') {
        songFetchCount += 1;
        return {
          ok: true,
          json: async () => ({
            id: 'song-1',
            title: 'Song One',
            artist: 'Artist One',
            audioUrl: 'https://example.com/one.mp3',
            segments: songFetchCount === 1
              ? [
                  {
                    id: 'seg-1',
                    songId: 'song-1',
                    order: 0,
                    label: 'Section 1',
                    lyricText: 'Verse 1',
                    startMs: 0,
                    endMs: 10000,
                  },
                ]
              : [
                  {
                    id: 'seg-1',
                    songId: 'song-1',
                    order: 0,
                    label: 'Section 1',
                    lyricText: 'Verse 1',
                    startMs: 0,
                    endMs: 10000,
                  },
                  {
                    id: 'seg-2',
                    songId: 'song-1',
                    order: 1,
                    label: 'Section 2',
                    lyricText: 'Verse 2',
                    startMs: 10000,
                    endMs: 20000,
                  },
                ],
            createdAt: '2025-01-01T00:00:00.000Z',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Home />);

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));

    expect(await screen.findByTestId('mock-practice-view')).toHaveTextContent('Segments: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Edit song' }));
    expect(await screen.findByTestId('mock-segment-editor')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('song-editor-back'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toHaveTextContent('Segments: 2');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/songs/song-1', expect.objectContaining({
      headers: expect.objectContaining({ 'X-User-ID': expect.stringMatching(/^guest-/) }),
    }));
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/songs/song-1')).toHaveLength(2);
  });

  it('shows breadcrumb root as Songs in song practice and returns to library when clicked', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));
    expect(await screen.findByTestId('mock-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
    expect(await screen.findByTestId('mock-select-song')).toBeInTheDocument();
  });

  it('opens the contour reference view from song practice and returns to practice', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));
    expect(await screen.findByTestId('mock-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open contour reference' }));
    expect(await screen.findByTestId('mock-contour-reference-view')).toHaveTextContent('Contours for Song One');
    expect(window.location.hash).toContain('view=song_contour_reference');

    const lastCall = contourReferenceViewMock.mock.calls.at(-1)?.[0] as { breadcrumbLabel?: string } | undefined;
    expect(lastCall?.breadcrumbLabel).toBe('Practice');

    fireEvent.click(screen.getByTestId('mock-contour-reference-back'));
    expect(await screen.findByTestId('mock-practice-view')).toBeInTheDocument();
    expect(window.location.hash).toContain('view=song_practice');
  });

  it('opens segment editor immediately after creating a song', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('new-song-button'));
    expect(await screen.findByTestId('mock-song-form-success')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-song-form-success'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-segment-editor')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/songs/song-1', expect.objectContaining({
      headers: expect.objectContaining({ 'X-User-ID': expect.stringMatching(/^guest-/) }),
    }));
    expect(window.localStorage.getItem('cantare:guest-progress:v1')).toContain('song-1');
    expect(window.localStorage.getItem('cantare:guest-progress:v1')).toContain('guest-');
  });

  it('writes hash route on navigation and keeps tabs navigable', async () => {
    render(<Home />);

    await waitFor(() => {
      expect(window.location.hash).toContain('view=playlists');
    });

    fireEvent.click(screen.getByTestId('library-tab'));
    fireEvent.click(screen.getByTestId('mock-select-song'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(window.location.hash).toContain('view=song_practice');
    });

    fireEvent.click(screen.getByText('Songs'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-select-song')).toBeInTheDocument();
    });
  });

  it('keeps the server render deterministic when signed-in settings are cached locally', () => {
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
      ],
    }));

    const html = renderToString(<Home />);
    expect(html).toContain('Cantare Music (Guest)');
    expect(html).not.toContain('>Cantare Music</h1>');
  });

  it('places Exercise after Shared and writes its hash route', async () => {
    render(<Home />);

    const tabs = screen.getByLabelText('Main sections').querySelectorAll('button');
    expect(Array.from(tabs).map((tab) => tab.textContent?.trim())).toEqual([
      'Playlists',
      'Library',
      'Shared',
      'Exercise',
    ]);

    fireEvent.click(screen.getByTestId('exercise-tab'));
    expect(await screen.findByTestId('exercise-browser')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toContain('view=exercise'));
  });

  it('refreshes playlist data when returning from song practice to playlist practice', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/playlists/playlist-1') {
        return {
          ok: true,
          json: async () => ({
            ...samplePlaylist,
            songs: [
              {
                ...samplePlaylist.songs[0],
                masteryPercent: 88,
              },
            ],
          }),
        };
      }

      if (url === '/api/songs/song-1') {
        return {
          ok: true,
          json: async () => ({
            id: 'song-1',
            title: 'Song One',
            artist: 'Artist One',
            audioUrl: 'https://example.com/one.mp3',
            segments: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            masteryPercent: 50,
          }),
        };
      }

      if (url === '/api/playlists/playlist-1/knowledge') {
        return {
          ok: true,
          json: async () => ({ score: 88 }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          id: 'song-1',
          title: 'Song One',
          artist: 'Artist One',
          audioUrl: 'https://example.com/one.mp3',
          segments: [],
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
      };
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Home />);

    fireEvent.click(screen.getByTestId('playlists-tab'));
    fireEvent.click(await screen.findByTestId('mock-playlist-practice'));
    expect(await screen.findByTestId('mock-playlist-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-playlist-select-song'));
    expect(await screen.findByTestId('mock-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set A' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-playlist-practice-view')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/playlists/playlist-1', expect.objectContaining({
      headers: expect.objectContaining({ 'X-User-ID': expect.stringMatching(/^guest-/) }),
    }));
  });

  it('opens song practice immediately from playlist data before song refresh resolves', async () => {
    let resolveSongFetch: ((value: {
      ok: true;
      json: () => Promise<{
        id: string;
        title: string;
        artist: string;
        audioUrl: string;
        segments: never[];
        createdAt: string;
      }>;
    }) => void) | null = null;

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/songs/song-1') {
        return new Promise((resolve) => {
          resolveSongFetch = resolve;
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Home />);

    fireEvent.click(screen.getByTestId('playlists-tab'));
    fireEvent.click(await screen.findByTestId('mock-playlist-practice'));
    expect(await screen.findByTestId('mock-playlist-practice-view')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-playlist-select-song'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });

    expect(resolveSongFetch).not.toBeNull();

    await act(async () => {
      resolveSongFetch?.({
        ok: true,
        json: async () => ({
          id: 'song-1',
          title: 'Song One',
          artist: 'Artist One',
          audioUrl: 'https://example.com/one.mp3',
          segments: [],
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
      });
      await Promise.resolve();
    });
  });

  it('shows current account details without legacy add-user controls', async () => {
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
      ],
    }));
    document.cookie = 'cantare-user-id=test-user; path=/';
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({
            user: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            actor: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            effectiveUser: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            isImpersonating: false,
          }),
        } as Response;
      }
      if (String(input) === '/api/users/me' && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            user: { id: 'test-user', username: 'new-singer', name: 'Test User', email: 'test@example.com' },
          }),
        } as Response;
      }
      if (String(input) === '/api/users/me/vocal-range' && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ range: JSON.parse(String(init.body)) }),
        } as Response;
      }
      if (String(input) === '/api/users/me/vocal-range') {
        return {
          ok: true,
          json: async () => ({ range: { low: 45, high: 64 } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    render(<Home />);

    await waitFor(() => {
      expect(screen.queryByText('Cantare Music (Guest)')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('home-settings-toggle'));
    fireEvent.click(screen.getByTestId('settings-section-account-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-current-email')).toHaveTextContent('test@example.com');
    });
    expect(screen.getByTestId('settings-current-username')).toHaveTextContent('@test-user');
    expect(screen.getByTestId('profile-display-name')).toHaveValue('Test User');
    expect(screen.getByTestId('profile-username')).toHaveValue('test-user');
    expect(screen.getByTestId('profile-vocal-range-editor')).toHaveTextContent('A2 to E4');

    fireEvent.change(screen.getByTestId('profile-username'), { target: { value: 'New Singer!' } });
    fireEvent.click(screen.getByText('Save profile'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Test User', username: 'new-singer' }),
      }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    fireEvent.click(screen.getByRole('button', { name: 'C5 highest range note' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/users/me/vocal-range', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ low: 45, high: 72 }),
      }));
    });
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-user-select')).not.toBeInTheDocument();
  });

  it('explains guest progress import and skip behavior', async () => {
    window.localStorage.setItem('cantare:guest-progress:v1', JSON.stringify({
      songIds: ['song-1'],
      guestUserId: 'guest-abc',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }));
    window.localStorage.setItem('cantare:guest-ratings:v1:song-1', JSON.stringify([
      { id: 'rating-1', segmentId: 'seg-1', rating: 4, ratedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'rating-2', segmentId: 'seg-2', rating: 5, ratedAt: '2026-06-01T00:01:00.000Z' },
    ]));
    document.cookie = 'cantare-user-id=test-user; path=/';
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({
            user: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            actor: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            effectiveUser: { id: 'test-user', username: 'test-user', name: 'Test User', email: 'test@example.com' },
            isImpersonating: false,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    render(<Home />);

    expect(await screen.findByTestId('guest-claim-prompt')).toHaveTextContent('1 song');
    expect(screen.getByTestId('guest-claim-prompt')).toHaveTextContent('2 saved ratings');
    expect(screen.getByTestId('guest-claim-prompt')).toHaveTextContent('Skip for this account will hide this reminder');

    fireEvent.click(screen.getByTestId('guest-claim-decline'));

    await waitFor(() => {
      expect(screen.queryByTestId('guest-claim-prompt')).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem('cantare:guest-progress-declined:test-user')).toBe('1');
  });

  it('opens account settings after first magic-link setup', async () => {
    window.history.pushState(null, '', '/?auth=signed-in&setup=username');
    document.cookie = 'cantare-user-id=new-user; path=/';
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({
            user: { id: 'new-user', username: 'singer', name: 'singer', email: 'singer@example.com' },
            actor: { id: 'new-user', username: 'singer', name: 'singer', email: 'singer@example.com' },
            effectiveUser: { id: 'new-user', username: 'singer', name: 'singer', email: 'singer@example.com' },
            isImpersonating: false,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-overlay')).toBeInTheDocument();
    });
    expect(screen.getByText('Choose a username for your Cantare profile.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('profile-username')).toHaveValue('singer');
    });
    expect(window.location.search).toBe('');
  });

  it('allows impersonated sessions to browse Shared even when the effective user has no email', async () => {
    window.history.replaceState(null, '', '/');
    window.localStorage.setItem('cantare:user-settings', JSON.stringify({
      segmentPrerollMs: 500,
      currentUserId: 'test-user',
      users: [
        { id: 'default', username: 'default', name: 'Default User', email: '' },
        { id: 'test-user', username: 'test-user', name: 'Test User', email: '' },
      ],
    }));
    document.cookie = 'cantare-user-id=test-user; path=/';

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/session') {
        return {
          ok: true,
          json: async () => ({
            actor: {
              id: 'admin-user',
              username: 'admin',
              name: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
            },
            effectiveUser: {
              id: 'test-user',
              username: 'test-user',
              name: 'Test User',
              email: '',
            },
            isImpersonating: true,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    }) as unknown as typeof fetch;

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('shared-tab'));

    expect(await screen.findByTestId('mock-shared-browser')).toBeInTheDocument();
    expect(screen.queryByTestId('shared-sign-in-required')).not.toBeInTheDocument();
  });
});
