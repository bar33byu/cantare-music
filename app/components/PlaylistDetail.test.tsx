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

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlistResponse });
  });

  it('renders song list in position order', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-song-row-song-1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('1. Song One');
    expect(rows[1]).toHaveTextContent('2. Song Two');
  });

  it('dragging song calls reorder patch', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} />);

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

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} />);

    await waitFor(() => expect(screen.getByTestId('playlist-add-song')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-add-song'));

    await waitFor(() => expect(screen.getByTestId('playlist-song-picker')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('playlist-song-picker'), { target: { value: 'song-3' } });
    fireEvent.click(screen.getByTestId('playlist-song-add-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('remove button calls DELETE', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => playlistResponse });

    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} />);
    await waitFor(() => expect(screen.getByTestId('playlist-song-remove-song-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-song-remove-song-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1/songs/song-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  it('back button calls onBack', async () => {
    render(<PlaylistDetail playlistId="pl-1" onBack={onBack} onPractice={onPractice} />);
    await waitFor(() => expect(screen.getByTestId('playlist-detail-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
