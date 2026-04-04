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
    { id: 'song-1', title: 'Song One', artist: 'Artist', audioUrl: '/api/audio/audio/song-one.mp3', ratingCount: 7, segments: [], createdAt: '2026-01-01T00:00:00.000Z', position: 0 },
    { id: 'song-2', title: 'Song Two', artist: 'Artist', audioUrl: '', ratingCount: 0, segments: [], createdAt: '2026-01-01T00:00:00.000Z', position: 1 },
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

  it('shows rating and audio metadata for each song row', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-row-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-song-ratings-song-1')).toHaveTextContent('7 ratings');
    expect(screen.getByTestId('playlist-song-audio-song-1')).toHaveTextContent('Audio attached');

    expect(screen.getByTestId('playlist-song-ratings-song-2')).toHaveTextContent('0 ratings');
    expect(screen.getByTestId('playlist-song-audio-song-2')).toHaveTextContent('No audio file');
  });

  it('falls back to ratings API when playlist payload omits ratingCount', async () => {
    const playlistWithoutCounts = {
      ...playlistResponse,
      songs: playlistResponse.songs.map(({ ratingCount, ...song }) => song),
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistWithoutCounts })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ratings: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ratings: [] }) });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-row-song-1')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1/ratings');
    expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-2/ratings');
    expect(screen.getByTestId('playlist-song-ratings-song-1')).toHaveTextContent('3 ratings');
    expect(screen.getByTestId('playlist-song-ratings-song-2')).toHaveTextContent('0 ratings');
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

    expect(onEditSong).toHaveBeenCalledWith('song-3');
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

    expect(onEditSong).toHaveBeenCalledWith('song-9');
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

  it('breadcrumb back calls onBack', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);
    await waitFor(() => expect(screen.getByTestId('playlist-detail-breadcrumb-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-detail-breadcrumb-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('escape closes the add-song search box', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'song-3', title: 'Song Three' }] });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    const search = await screen.findByTestId('playlist-song-search');
    fireEvent.keyDown(search, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('playlist-song-search')).not.toBeInTheDocument();
    });
  });

  it('shows create-new-song action immediately when picker opens', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'song-3', title: 'Song Three' }] });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} onEditSong={onEditSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    const createButton = await screen.findByTestId('playlist-song-create-submit');
    expect(createButton).toBeInTheDocument();
    expect(createButton).toHaveTextContent('Create and Add New Song');
    expect(createButton).toBeDisabled();
  });
});
