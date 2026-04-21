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
  songCount: 3,
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

  it('clicking the playlist row opens practice', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-open-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-open-pl-1'));
    expect(onSelectPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-1', songs: [] }));
  });

  it('toggle archived refetches includeRetired=true', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('toggle-archived-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/playlists?includeRetired=true'),
        expect.objectContaining({ cache: 'no-store' })
      );
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

  it('new playlist button opens form and submit transitions to manage mode', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('new-playlist-button'));
    expect(screen.getByTestId('new-playlist-form')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pl-2',
        name: 'Conference Set',
        isRetired: false,
        createdAt: '2026-03-05T00:00:00.000Z',
        songCount: 0,
      }),
    });

    fireEvent.change(screen.getByTestId('new-playlist-name'), { target: { value: 'Conference Set' } });
    fireEvent.click(screen.getByTestId('create-playlist-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists', expect.objectContaining({ method: 'POST', cache: 'no-store' }));
      expect(onManagePlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-2', name: 'Conference Set', songs: [] }));
    });
  });

  it('retire button patches playlist', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-actions-pl-1'));
    mockFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ playlists: [basePlaylist] }) });
    fireEvent.click(screen.getByTestId('playlist-retire-pl-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  it('delete confirm flow works', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-actions-pl-1'));
    fireEvent.click(screen.getByTestId('playlist-delete-pl-1'));
    expect(screen.getByTestId('playlist-delete-confirm-pl-1')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ playlists: [] }) });
    fireEvent.click(screen.getByTestId('playlist-delete-confirm-yes-pl-1'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/playlists/pl-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  it('actions menu exposes manage action', async () => {
    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);
    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('playlist-actions-pl-1'));
    fireEvent.click(screen.getByTestId('playlist-manage-pl-1'));

    expect(onManagePlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-1', songs: [] }));
  });

  it('renders playlist health metrics when detail data is available', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ playlists: [basePlaylist] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 85 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pl-1',
          songs: [
            { id: 's1', audioUrl: '/a1.mp3', segments: [{ id: 'seg-1', pitchContourNotes: [{ id: 'n1' }] }] },
            { id: 's2', audioUrl: '/a2.mp3', segments: [{ id: 'seg-2', pitchContourNotes: [] }] },
            { id: 's3', audioUrl: '', segments: [] },
          ],
        }),
      });

    render(<PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />);

    await waitFor(() => expect(screen.getByTestId('playlist-row-pl-1')).toBeInTheDocument());

    expect(screen.getByTestId('playlist-health-pl-1')).toHaveTextContent('Audio 2/3');
    expect(screen.getByTestId('playlist-health-pl-1')).toHaveTextContent('Sections 2/3');
    expect(screen.getByTestId('playlist-health-pl-1')).toHaveTextContent('Tap keys 1/3');
    expect(screen.getByTestId('playlist-knowledge-pl-1')).toHaveTextContent('Knowledge: 85%');
  });

  it('refetches playlists when userId changes', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const userHeader = headers.get('X-User-ID');

      if (url.startsWith('/api/playlists?')) {
        return {
          ok: true,
          json: async () => ({
            playlists: [
              {
                ...basePlaylist,
                id: userHeader === 'test-user' ? 'pl-2' : 'pl-1',
                name: userHeader === 'test-user' ? 'Test User Set' : 'April Set',
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/knowledge')) {
        return { ok: true, json: async () => ({ score: 0 }) } as Response;
      }

      return { ok: true, json: async () => ({ id: 'pl-1', songs: [] }) } as Response;
    });

    const { rerender } = render(
      <PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('playlist-name-pl-1')).toHaveTextContent('April Set');
    });

    rerender(
      <PlaylistBrowser
        onSelectPlaylist={onSelectPlaylist}
        onManagePlaylist={onManagePlaylist}
        userId="test-user"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('playlist-name-pl-2')).toHaveTextContent('Test User Set');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/playlists?'),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    const matchingCall = mockFetch.mock.calls.find(
      ([calledUrl, calledInit]) =>
        String(calledUrl).startsWith('/api/playlists?') &&
        calledInit &&
        new Headers((calledInit as RequestInit).headers).get('X-User-ID') === 'test-user'
    );
    expect(matchingCall).toBeTruthy();
  });

  it('keeps the newest user switch result when earlier requests finish later', async () => {
    let resolveDefaultList: ((value: Response) => void) | null = null;
    let resolveTestUserList: ((value: Response) => void) | null = null;

    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const userHeader = headers.get('X-User-ID');

      if (url.startsWith('/api/playlists?') && !userHeader) {
        return new Promise<Response>((resolve) => {
          resolveDefaultList = resolve;
        });
      }

      if (url.startsWith('/api/playlists?') && userHeader === 'test-user') {
        return new Promise<Response>((resolve) => {
          resolveTestUserList = resolve;
        });
      }

      if (url.includes('/knowledge')) {
        return Promise.resolve({ ok: true, json: async () => ({ score: 0 }) } as Response);
      }

      return Promise.resolve({ ok: true, json: async () => ({ id: 'pl-x', songs: [] }) } as Response);
    });

    const { rerender } = render(
      <PlaylistBrowser onSelectPlaylist={onSelectPlaylist} onManagePlaylist={onManagePlaylist} />
    );

    rerender(
      <PlaylistBrowser
        onSelectPlaylist={onSelectPlaylist}
        onManagePlaylist={onManagePlaylist}
        userId="test-user"
      />
    );

    resolveTestUserList?.({
      ok: true,
      json: async () => ({
        playlists: [{ ...basePlaylist, id: 'pl-2', name: 'Test User Set' }],
      }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-name-pl-2')).toHaveTextContent('Test User Set');
    });

    resolveDefaultList?.({
      ok: true,
      json: async () => ({
        playlists: [{ ...basePlaylist, id: 'pl-1', name: 'April Set' }],
      }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-name-pl-2')).toHaveTextContent('Test User Set');
    });

    expect(screen.queryByTestId('playlist-name-pl-1')).not.toBeInTheDocument();
  });
});
