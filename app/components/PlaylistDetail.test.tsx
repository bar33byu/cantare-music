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

  it('add song button opens picker and selecting song posts', async () => {
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

    fireEvent.click(screen.getByTestId('playlist-song-add-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs', expect.objectContaining({ method: 'POST' }));
    });

    expect(onEditSong).not.toHaveBeenCalled();
    expect(screen.queryByTestId('playlist-song-search')).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('playlist-song-search')).not.toBeInTheDocument();
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

  it('checks source updates and runs a full source resync', async () => {
    const importedPlaylist = {
      ...playlistResponse,
      sourcePlaylistId: 'source-pl',
      lastSourceSyncCheckedAt: null,
      lastSourceSyncedAt: null,
    };
    const diff = {
      sourceAvailable: true,
      checkedAt: '2026-06-05T12:00:00.000Z',
      lastSourceSyncCheckedAt: '2026-06-05T12:00:00.000Z',
      lastSourceSyncedAt: null,
      source: {
        id: 'source-pl',
        name: 'Source Set',
        owner: { displayName: 'Taylor', username: 'taylor' },
      },
      counts: { added: 1, removed: 1, changed: 1 },
      orderChanged: true,
      hasChanges: true,
    };
    const diffAfter = {
      ...diff,
      counts: { added: 0, removed: 0, changed: 0 },
      orderChanged: false,
      hasChanges: false,
      lastSourceSyncedAt: '2026-06-05T12:01:00.000Z',
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => importedPlaylist })
      .mockResolvedValueOnce({ ok: true, json: async () => diff })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          applied: { added: 1, updated: 1, removedFromPlaylist: 1, orderUpdated: true },
          diffAfter,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...importedPlaylist, lastSourceSyncedAt: '2026-06-05T12:01:00.000Z' }) });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-source-check')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-source-check'));

    await waitFor(() => {
      expect(screen.getByTestId('playlist-source-added')).toHaveTextContent('1 added');
      expect(screen.getByTestId('playlist-source-changed')).toHaveTextContent('1 changed');
      expect(screen.getByTestId('playlist-source-removed')).toHaveTextContent('1 removed');
    });

    fireEvent.click(screen.getByTestId('playlist-source-full-sync'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/source-sync', expect.objectContaining({ method: 'POST' }));
      expect(screen.getByTestId('playlist-source-message')).toHaveTextContent('Synced: 1 added, 1 updated, 1 removed from playlist, order updated.');
    });
    const syncCall = mockFetch.mock.calls.find(([url, init]) => url === '/api/playlists/pl-1/source-sync' && init?.method === 'POST');
    expect(JSON.parse(String(syncCall?.[1]?.body))).toEqual({ mode: 'full' });
  });

  it('back button calls onBack', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-detail-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
