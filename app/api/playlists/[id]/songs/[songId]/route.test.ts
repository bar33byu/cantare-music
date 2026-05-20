import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  removeSongFromPlaylist: vi.fn(),
}));

import { DELETE } from './route';
import { getPlaylistById, removeSongFromPlaylist } from '../../../../../../db/queries';
import { USER_ID_HEADER } from '../../../../../lib/userContext';

describe('DELETE /api/playlists/[id]/songs/[songId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes song from playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);
    const request = new Request('http://localhost/api/playlists/pl-1/songs/song-1', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1', songId: 'song-1' }) });

    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'default');
    expect(removeSongFromPlaylist).toHaveBeenCalledWith('pl-1', 'song-1', 'default');
  });

  it('removes song from playlist for the request user', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', name: 'Set' } as any);
    const request = new Request('http://localhost/api/playlists/pl-1/songs/song-1', {
      method: 'DELETE',
      headers: { [USER_ID_HEADER]: 'Test User' },
    });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1', songId: 'song-1' }) });

    expect(response.status).toBe(204);
    expect(getPlaylistById).toHaveBeenCalledWith('pl-1', 'test-user');
    expect(removeSongFromPlaylist).toHaveBeenCalledWith('pl-1', 'song-1', 'test-user');
  });

  it('returns 404 when playlist does not belong to request user', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);
    const request = new Request('http://localhost/api/playlists/pl-1/songs/song-1', {
      method: 'DELETE',
      headers: { [USER_ID_HEADER]: 'Test User' },
    });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1', songId: 'song-1' }) });

    expect(response.status).toBe(404);
    expect(removeSongFromPlaylist).not.toHaveBeenCalled();
  });
});
