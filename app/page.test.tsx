import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

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
  default: () => <div data-testid="mock-practice-view">Practice View</div>,
}));

vi.mock('./components/SegmentEditor', () => ({
  SegmentEditor: () => <div data-testid="mock-segment-editor">Segment Editor</div>,
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
});
