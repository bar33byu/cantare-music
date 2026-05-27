import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  enablePlaylistPublicSharing: vi.fn(),
  disablePlaylistPublicSharing: vi.fn(),
}));

import { DELETE, POST } from './route';
import { disablePlaylistPublicSharing, enablePlaylistPublicSharing, getPlaylistById } from '../../../../../db/queries';

describe('POST /api/playlists/[id]/public', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes an owned playlist with the selected audio mode', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);
    vi.mocked(enablePlaylistPublicSharing).mockResolvedValue({
      id: 'pl-1',
      name: 'Set',
      isRetired: false,
      isPublic: true,
      shareAudioMode: 'both',
      publicShareAudioMode: 'blend',
      createdAt: '2026-01-01T00:00:00.000Z',
      songCount: 0,
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicShareAudioMode: 'blend' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(200);
    expect(enablePlaylistPublicSharing).toHaveBeenCalledWith('pl-1', 'default', 'blend');
  });

  it('returns 404 when the user does not own the playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);

    const request = new Request('http://localhost/api/playlists/pl-x/public', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-x' }) });

    expect(response.status).toBe(404);
    expect(enablePlaylistPublicSharing).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/playlists/[id]/public', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes an owned playlist from public sharing only', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);
    vi.mocked(disablePlaylistPublicSharing).mockResolvedValue(true);

    const request = new Request('http://localhost/api/playlists/pl-1/public', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(204);
    expect(disablePlaylistPublicSharing).toHaveBeenCalledWith('pl-1', 'default');
  });
});
