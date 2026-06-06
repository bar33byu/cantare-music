import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistDetail } from './PlaylistDetail';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const playlistResponse = {
  id: 'pl-1',
  name: 'April Set',
  eventDate: '2026-04-04',
  isRetired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  songs: [
    { id: 'song-1', title: 'Song One', artist: 'Artist', audioUrl: '', segments: [], createdAt: '2026-01-01T00:00:00.000Z', position: 0 },
    { id: 'song-2', title: 'Song Two', artist: 'Artist', audioUrl: '', segments: [], createdAt: '2026-01-01T00:00:00.000Z', position: 1 },
  ],
};

describe('PlaylistDetail', () => {
  const onBack = vi.fn();
  const onPractice = vi.fn();
  const onEditSong = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlistResponse });
  });

  it('renders song list in position order', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-row-song-1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('1. Song One');
    expect(rows[1]).toHaveTextContent('2. Song Two');
  });

  it('dragging song calls reorder patch', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-row-song-1')).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: true });
    fireEvent.dragStart(screen.getByTestId('playlist-song-row-song-1'));
    fireEvent.drop(screen.getByTestId('playlist-song-row-song-2'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  it('add song button keeps picker open and clicking a suggestion posts immediately', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'song-3', title: 'Song Three' }] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    await waitFor(() => expect(screen.getByTestId('playlist-song-search')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('playlist-song-search'), { target: { value: 'Three' } });

    await waitFor(() => expect(screen.getByTestId('playlist-song-suggestion-song-3')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-song-suggestion-song-3'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs', expect.objectContaining({ method: 'POST' }));
    });

    expect(onEditSong).not.toHaveBeenCalled();
    expect(screen.getByTestId('playlist-song-search')).toBeInTheDocument();
    expect(screen.queryByTestId('playlist-song-add-submit')).not.toBeInTheDocument();
  });

  it('creates a new song inline and adds it to the playlist', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'song-9', title: 'Brand New Song', audioUrl: '', segments: [], createdAt: '2026-01-01T00:00:00.000Z' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    await waitFor(() => expect(screen.getByTestId('playlist-song-search')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('playlist-song-search'), { target: { value: 'Brand New Song' } });
    fireEvent.click(screen.getByTestId('playlist-song-create-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs', expect.objectContaining({ method: 'POST' }));
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs', expect.objectContaining({ method: 'POST' }));
    });

    expect(onEditSong).not.toHaveBeenCalled();
    expect(screen.getByTestId('playlist-song-search')).toBeInTheDocument();
  });

  it('renames the playlist from the detail view', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    const input = await screen.findByTestId('playlist-detail-name-input');
    fireEvent.change(input, { target: { value: 'June Set' } });
    fireEvent.click(screen.getByTestId('playlist-detail-name-save'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1', expect.objectContaining({ method: 'PATCH' }));
    });
    const renameCall = mockFetch.mock.calls.find(([url, init]) => url === '/api/playlists/pl-1' && init?.method === 'PATCH');
    expect(JSON.parse(String(renameCall?.[1]?.body))).toEqual({ name: 'June Set' });
    expect(screen.getByTestId('playlist-detail-name-input')).toHaveValue('June Set');
  });

  it('pressing escape in song search closes the picker', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'song-3', title: 'Song Three' }] });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    const searchInput = await screen.findByTestId('playlist-song-search');
    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('playlist-song-search')).not.toBeInTheDocument();
    });
  });

  it('remove button calls DELETE', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-song-remove-song-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-song-remove-song-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs/song-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  it('enables and disables playlist sharing', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pl-1',
          name: 'April Set',
          isRetired: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          shareToken: 'share-token-1',
          shareUrl: 'http://localhost/share/playlists/share-token-1',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-share')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('playlist-share-audio-mode'), { target: { value: 'blend' } });

    fireEvent.click(screen.getByTestId('playlist-share'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/share', expect.objectContaining({ method: 'POST' }));
      expect(screen.getByTestId('playlist-share-link')).toHaveAttribute('href', expect.stringContaining('/share/playlists/share-token-1'));
    });
    const shareCall = mockFetch.mock.calls.find(([url, init]) => url === '/api/playlists/pl-1/share' && init?.method === 'POST');
    expect(JSON.parse(String(shareCall?.[1]?.body))).toEqual({ shareAudioMode: 'blend' });

    fireEvent.click(screen.getByTestId('playlist-unshare'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/share', expect.objectContaining({ method: 'DELETE' }));
      expect(screen.getByTestId('playlist-share')).toBeInTheDocument();
    });
  });

  it('publishes and unpublishes public sharing with independent audio settings', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...playlistResponse, shareToken: 'share-token-1', shareAudioMode: 'blend', publicShareAudioMode: 'both' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...playlistResponse,
          isPublic: true,
          shareToken: 'share-token-1',
          shareAudioMode: 'blend',
          publicShareAudioMode: 'part',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-publish-public')).toBeInTheDocument());

    expect(screen.getByTestId('playlist-share-audio-mode')).toHaveValue('blend');
    expect(screen.getByTestId('playlist-public-share-audio-mode')).toHaveValue('both');

    fireEvent.change(screen.getByTestId('playlist-public-share-audio-mode'), { target: { value: 'part' } });
    fireEvent.click(screen.getByTestId('playlist-publish-public'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/public', expect.objectContaining({ method: 'POST' }));
      expect(screen.getByTestId('playlist-share-link')).toHaveAttribute('href', expect.stringContaining('/share/playlists/share-token-1'));
    });
    const publicCall = mockFetch.mock.calls.find(([url, init]) => url === '/api/playlists/pl-1/public' && init?.method === 'POST');
    expect(JSON.parse(String(publicCall?.[1]?.body))).toEqual({ publicShareAudioMode: 'part' });
    expect(screen.getByTestId('playlist-share-audio-mode')).toHaveValue('blend');

    fireEvent.click(screen.getByTestId('playlist-unpublish-public'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/public', expect.objectContaining({ method: 'DELETE' }));
      expect(screen.getByTestId('playlist-share-link')).toHaveAttribute('href', expect.stringContaining('/share/playlists/share-token-1'));
    });
  });

  it('checks an imported playlist source and imports selected songs manually', async () => {
    const importedPlaylist = {
      ...playlistResponse,
      sourcePlaylistId: 'source-pl',
      sourceOwnerId: 'owner-1',
      sourceShareToken: 'share-token',
      songs: [
        { ...playlistResponse.songs[0], sourceSongId: 'source-song-1' },
      ],
    };
    const refreshedPlaylist = {
      ...importedPlaylist,
      songs: [
        { id: 'song-9', sourceSongId: 'source-song-1', title: 'Song One Updated', artist: 'Artist', audioUrl: '', segments: [], createdAt: '2026-01-01T00:00:00.000Z', position: 0 },
      ],
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => importedPlaylist })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sourcePlaylist: {
            id: 'source-pl',
            name: 'Shared Set',
            owner: { id: 'owner-1', displayName: 'Owner Name', username: 'owner' },
          },
          candidates: [
            {
              sourceSongId: 'source-song-1',
              currentSongId: 'song-1',
              title: 'Song One Updated',
              artist: 'Artist',
              position: 0,
              status: 'refreshable',
              segmentCount: 2,
              hasPartAudio: true,
              hasBlendAudio: false,
            },
            {
              sourceSongId: 'source-song-3',
              currentSongId: null,
              title: 'Song Three',
              position: 2,
              status: 'new',
              segmentCount: 1,
              hasPartAudio: true,
              hasBlendAudio: true,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ importedCount: 1, playlist: refreshedPlaylist }),
      });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-refresh-panel')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-refresh-check'));

    await waitFor(() => expect(screen.getByTestId('playlist-refresh-song-source-song-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-refresh-song-source-song-3'));
    fireEvent.click(screen.getByTestId('playlist-refresh-import'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/refresh', expect.objectContaining({ method: 'POST' }));
      expect(screen.getByText('Song One Updated')).toBeInTheDocument();
    });
    const importCall = mockFetch.mock.calls.find(([url, init]) => url === '/api/playlists/pl-1/refresh' && init?.method === 'POST');
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({ sourceSongIds: ['source-song-1'] });
  });

  it('shows an up-to-date message when the shared source has no changes', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...playlistResponse, sourcePlaylistId: 'source-pl', sourceOwnerId: 'owner-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sourcePlaylist: {
            id: 'source-pl',
            name: 'Shared Set',
            owner: { id: 'owner-1', displayName: 'Owner Name', username: 'owner' },
          },
          candidates: [],
        }),
      });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-refresh-check')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-refresh-check'));

    await waitFor(() => {
      expect(screen.getByTestId('playlist-refresh-message')).toHaveTextContent('This copy is up to date with the shared playlist.');
    });
    expect(screen.queryByTestId('playlist-refresh-import')).not.toBeInTheDocument();
    expect(screen.queryByTestId('playlist-refresh-toggle-all')).not.toBeInTheDocument();
  });

  it('back button calls onBack', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-detail-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
