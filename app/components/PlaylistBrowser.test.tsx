import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistBrowser } from './PlaylistBrowser';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const basePlaylist = {
  id: 'pl-1',
  name: 'April Set',
  eventDate: '2026-04-04',
  isRetired: false,
  createdAt: '2026-03-01T00:00:00.000Z',
  songs: [],
};

describe('PlaylistBrowser', () => {
  const onSelectPlaylist = vi.fn();
  const onManagePlaylist = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ playlists: [basePlaylist] }),
    });
  });

  it('shows loading skeleton while fetching', () => {
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    expect(screen.getByTestId('playlist-loading')).toBeInTheDocument();
  });

  it('renders playlists after fetch', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => {
      expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument();
    });
  });

  it('toggle archived refetches includeRetired=true', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('toggle-archived-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists?includeRetired=true');
    });
  });

  it('retired playlists render with italic style', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ playlists: [{ ...basePlaylist, isRetired: true }] }),
    });

    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    expect(screen.getByTestId('playlist-row-pl-1').className).toContain('italic');
  });

  it('new playlist button opens form and submit posts', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('new-playlist-button'));
    expect(screen.getByTestId('new-playlist-form')).toBeInTheDocument();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pl-2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ playlists: [basePlaylist] }) });

    fireEvent.change(screen.getByTestId('new-playlist-name'), { target: { value: 'Conference Set' } });
    fireEvent.click(screen.getByTestId('create-playlist-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('retire button patches playlist', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ playlists: [basePlaylist] }) });
    fireEvent.click(screen.getByTestId('playlist-retire-pl-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  it('delete confirm flow works', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-delete-pl-1'));
    expect(screen.getByTestId('playlist-delete-confirm-pl-1')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ playlists: [] }) });
    fireEvent.click(screen.getByTestId('playlist-delete-confirm-yes-pl-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });
});
