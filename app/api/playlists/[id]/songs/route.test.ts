import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  addSongToPlaylist: vi.fn(),
  reorderPlaylistSongs: vi.fn(),
}));

import { PATCH, POST } from './route';
import { addSongToPlaylist, getPlaylistById, reorderPlaylistSongs } from '../../../../../db/queries';
import { USER_ID_HEADER } from '../../../../lib/userContext';

describe('POST /api/playlists/[id]/songs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds song to playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: 'song-1' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'default');
    expect(addSongToPlaylist).toHaveBeenCalledWith('pl-1', 'song-1', undefined, 'default');
  });

  it('adds song to playlist for the request user', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [USER_ID_HEADER]: 'Test User' },
      body: JSON.stringify({ songId: 'song-1' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'test-user');
    expect(addSongToPlaylist).toHaveBeenCalledWith('pl-1', 'song-1', undefined, 'test-user');
  });

  it('returns 400 when songId missing', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);
    const request = new Request('http://localhost/api/playlists/pl-1/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/playlists/[id]/songs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reorders playlist songs', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/songs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedSongIds: ['song-2', 'song-1'] }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'default');
    expect(reorderPlaylistSongs).toHaveBeenCalledWith('pl-1', ['song-2', 'song-1'], 'default');
  });

  it('reorders playlist songs for the request user', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/songs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', [USER_ID_HEADER]: 'Test User' },
      body: JSON.stringify({ orderedSongIds: ['song-2', 'song-1'] }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'test-user');
    expect(reorderPlaylistSongs).toHaveBeenCalledWith('pl-1', ['song-2', 'song-1'], 'test-user');
  });
});
