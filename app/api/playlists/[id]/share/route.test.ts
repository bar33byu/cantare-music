import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  enablePlaylistSharing: vi.fn(),
  disablePlaylistSharing: vi.fn(),
}));

import { DELETE, POST } from './route';
import { disablePlaylistSharing, enablePlaylistSharing, getPlaylistById } from '../../../../../db/queries';

describe('POST /api/playlists/[id]/share', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enables sharing for an owned playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);
    vi.mocked(enablePlaylistSharing).mockResolvedValue({
      id: 'pl-1',
      name: 'Set',
      isRetired: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      songCount: 0,
      shareToken: 'share-token-1',
      sharedAt: '2026-05-24T00:00:00.000Z',
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/share', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(enablePlaylistSharing).toHaveBeenCalledWith('pl-1', 'default');
    expect(data.shareUrl).toBe('http://localhost/share/playlists/share-token-1');
  });

  it('returns 404 when the user does not own the playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);

    const request = new Request('http://localhost/api/playlists/pl-x/share', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-x' }) });

    expect(response.status).toBe(404);
    expect(enablePlaylistSharing).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/playlists/[id]/share', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables sharing for an owned playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);
    vi.mocked(disablePlaylistSharing).mockResolvedValue(true);

    const request = new Request('http://localhost/api/playlists/pl-1/share', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(204);
    expect(disablePlaylistSharing).toHaveBeenCalledWith('pl-1', 'default');
  });
});
