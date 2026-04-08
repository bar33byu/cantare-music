import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/queries', () => ({
  removeSongFromPlaylist: vi.fn(),
}));

import { DELETE } from './route';
import { removeSongFromPlaylist } from '../../../../../../db/queries';

describe('DELETE /api/playlists/[id]/songs/[songId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes song from playlist', async () => {
    const request = new Request('http://localhost/api/playlists/pl-1/songs/song-1', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1', songId: 'song-1' }) });

    expect(response.status).toBe(204);
    expect(removeSongFromPlaylist).toHaveBeenCalledWith('pl-1', 'song-1', 'default');
  });
});
