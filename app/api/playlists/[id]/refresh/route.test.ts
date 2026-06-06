import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getImportedPlaylistRefreshPreview: vi.fn(),
  refreshImportedPlaylistSongs: vi.fn(),
}));

import { GET, POST } from './route';
import { getImportedPlaylistRefreshPreview, refreshImportedPlaylistSongs } from '../../../../../db/queries';

describe('GET /api/playlists/[id]/refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns refresh preview for an imported playlist', async () => {
    vi.mocked(getImportedPlaylistRefreshPreview).mockResolvedValue({
      sourcePlaylist: {
        id: 'source-pl',
        name: 'Shared Set',
        owner: { id: 'owner-1', displayName: 'Owner', username: 'owner' },
      },
      candidates: [],
    });

    const response = await GET(new Request('http://localhost/api/playlists/pl-1/refresh') as any, {
      params: Promise.resolve({ id: 'pl-1' }),
    });

    expect(response.status).toBe(200);
    expect(getImportedPlaylistRefreshPreview).toHaveBeenCalledWith('pl-1', 'default');
  });

  it('returns 404 when the shared source is unavailable', async () => {
    vi.mocked(getImportedPlaylistRefreshPreview).mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/playlists/pl-1/refresh') as any, {
      params: Promise.resolve({ id: 'pl-1' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/playlists/[id]/refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imports selected source songs', async () => {
    vi.mocked(refreshImportedPlaylistSongs).mockResolvedValue({
      importedCount: 2,
      playlist: { id: 'pl-1', name: 'Set', isRetired: false, createdAt: '2026-01-01T00:00:00.000Z', songs: [] },
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceSongIds: ['source-song-1', 'source-song-2'] }),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(200);
    expect(refreshImportedPlaylistSongs).toHaveBeenCalledWith('pl-1', ['source-song-1', 'source-song-2'], 'default');
  });

  it('validates selected source songs', async () => {
    const request = new Request('http://localhost/api/playlists/pl-1/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceSongIds: ['source-song-1', 2] }),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(400);
    expect(refreshImportedPlaylistSongs).not.toHaveBeenCalled();
  });
});
