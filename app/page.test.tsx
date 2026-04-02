import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

const practiceViewMock = vi.fn();

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
  }: {
    song: { segments: Array<unknown> };
    breadcrumbRootLabel?: string;
    onBreadcrumbRootClick?: () => void;
    onEditSongClick?: () => void;
  }) => {
    practiceViewMock(song);
    return (
      <div data-testid="mock-practice-view">
        Segments: {song.segments.length}
        {breadcrumbRootLabel ? (
          <button onClick={onBreadcrumbRootClick}>{breadcrumbRootLabel}</button>
        ) : null}
        {onEditSongClick ? (
          <button aria-label="Edit song" onClick={onEditSongClick}>Edit</button>
        ) : null}
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
  PlaylistBrowser: ({ onSelectPlaylist, onManagePlaylist }: { onSelectPlaylist: (playlist: any) => void; onManagePlaylist: (playlist: any) => void }) => (
    <div data-testid="mock-playlist-browser">
      <button data-testid="mock-playlist-practice" onClick={() => onSelectPlaylist(samplePlaylist)}>
        Practice Playlist
      </button>
      <button data-testid="mock-playlist-manage" onClick={() => onManagePlaylist(samplePlaylist)}>
        Manage Playlist
      </button>
    </div>
  ),
}));

vi.mock('./components/PlaylistDetail', () => ({
  PlaylistDetail: ({ onPractice, onBack }: { onPractice: (playlist: any) => void; onBack: () => void }) => (
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
  PlaylistPracticeView: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="mock-playlist-practice-view">
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

  it('shows library by default and opens song practice when selecting a song', async () => {
    render(<Home />);

    expect(screen.getByText('Cantare Music')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-select-song'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toBeInTheDocument();
    });
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'song-1',
          title: 'Song One',
          artist: 'Artist One',
          audioUrl: 'https://example.com/one.mp3',
          segments: [
            {
              id: 'seg-1',
              songId: 'song-1',
              order: 0,
              label: 'Section 1',
              lyricText: 'Verse 1',
              startMs: 0,
              endMs: 10000,
            },
          ],
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'song-1',
          title: 'Song One',
          artist: 'Artist One',
          audioUrl: 'https://example.com/one.mp3',
          segments: [
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
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Home />);

    fireEvent.click(screen.getByTestId('mock-select-song'));

    expect(await screen.findByTestId('mock-practice-view')).toHaveTextContent('Segments: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Edit song' }));
    expect(await screen.findByTestId('mock-segment-editor')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-segment-editor-back'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-view')).toHaveTextContent('Segments: 2');
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/songs/song-1');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/songs/song-1');
  });

  it('shows breadcrumb root as Songs in song practice and returns to library when clicked', async () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId('mock-select-song'));
    expect(await screen.findByTestId('mock-practice-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
    expect(await screen.findByTestId('mock-select-song')).toBeInTheDocument();
  });
});
