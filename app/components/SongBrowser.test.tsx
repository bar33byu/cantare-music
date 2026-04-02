import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SongBrowser } from './SongBrowser';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SongBrowser', () => {
  const mockOnSelectSong = vi.fn();
  const mockOnDeleteSong = vi.fn();

  const mockSongs = [
    {
      id: 'song-1',
      title: 'Test Song 1',
      artist: 'Test Artist 1',
      audioKey: 'audio-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastPracticedAt: '2024-02-01T00:00:00.000Z',
      masteryPercent: 72,
    },
    {
      id: 'song-2',
      title: 'Test Song 2',
      artist: 'Test Artist 2',
      audioKey: 'audio-2',
      createdAt: '2024-01-02T00:00:00.000Z',
      lastPracticedAt: null,
      masteryPercent: 10,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).confirm = vi.fn(() => true);
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    expect(screen.getByTestId('song-browser-loading')).toBeInTheDocument();
  });

  it('fetches and displays songs successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-grid')).toBeInTheDocument();
    });

    expect(screen.getByTestId('song-item-song-1')).toBeInTheDocument();
    expect(screen.getByTestId('song-title-song-1')).toHaveTextContent('Test Song 1');
    expect(screen.getByTestId('song-artist-song-1')).toHaveTextContent('Test Artist 1');
    expect(screen.getByTestId('song-last-practiced-song-1').textContent).toMatch(/^Last practiced .* ago$/);
    expect(screen.getByTestId('song-last-practiced-song-2')).toHaveTextContent('Not practiced yet');

    expect(screen.getByTestId('song-item-song-2')).toBeInTheDocument();
    expect(screen.getByTestId('song-title-song-2')).toHaveTextContent('Test Song 2');
    expect(screen.getByTestId('song-artist-song-2')).toHaveTextContent('Test Artist 2');
    expect(screen.getByTestId('song-mastery-percent-song-1')).toHaveTextContent('72%');
    expect(screen.getByTestId('song-mastery-fill-song-1')).toHaveStyle({ width: '72%' });
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('song-browser-error')).toHaveTextContent('Unable to load song list right now.');
  });

  it('shows empty state when no songs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-empty')).toBeInTheDocument();
    });

    expect(screen.getByTestId('song-browser-empty')).toHaveTextContent('No songs found. Add your first song to get started!');
  });

  it('calls onSelectSong when song is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-item-song-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('song-item-song-1'));

    expect(mockOnSelectSong).toHaveBeenCalledWith(mockSongs[0]);
  });

  it('highlights selected song', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} selectedSongId="song-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('song-selected-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('song-selected-song-1')).toHaveTextContent('Currently Selected');
  });

  it('refreshes when refreshTrigger changes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    const { rerender } = render(<SongBrowser onSelectSong={mockOnSelectSong} refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-grid')).toBeInTheDocument();
    });

    // Mock a different response for the second fetch
    const newSongs = [{ ...mockSongs[0], title: 'Updated Title' }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(newSongs),
    });

    rerender(<SongBrowser onSelectSong={mockOnSelectSong} refreshTrigger={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-title-song-1')).toHaveTextContent('Updated Title');
    });
  });

  it('handles network error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('song-browser-error')).toHaveTextContent('Unable to load song list right now.');
  });

  it('deletes a song and calls onDeleteSong callback', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSongs),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    render(<SongBrowser onSelectSong={mockOnSelectSong} onDeleteSong={mockOnDeleteSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-item-song-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('song-browser-toggle-edit-mode'));

    fireEvent.click(screen.getByTestId('song-delete-song-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs/song-1', { method: 'DELETE' });
    });

    expect(mockOnDeleteSong).toHaveBeenCalledWith('song-1');
    expect(screen.queryByTestId('song-item-song-1')).not.toBeInTheDocument();
  });

  it('does not delete when confirmation is cancelled', async () => {
    (window as any).confirm = vi.fn(() => false);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} onDeleteSong={mockOnDeleteSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-item-song-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('song-browser-toggle-edit-mode'));

    fireEvent.click(screen.getByTestId('song-delete-song-1'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockOnDeleteSong).not.toHaveBeenCalled();
  });

  it('hides delete controls until edit mode is enabled', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSongs),
    });

    render(<SongBrowser onSelectSong={mockOnSelectSong} />);

    await waitFor(() => {
      expect(screen.getByTestId('song-browser-grid')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('song-delete-song-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('song-browser-toggle-edit-mode'));
    expect(screen.getByTestId('song-delete-song-1')).toBeInTheDocument();
  });
});