import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
}));

import { DELETE, GET, PATCH } from './route';
import { deletePlaylist, getPlaylistById, updatePlaylist } from '../../../../db/queries';

describe('GET /api/playlists/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns playlist detail', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(200);
  });

  it('returns 404 when missing', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);
    const request = new Request('http://localhost/api/playlists/pl-x');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-x' }) });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/playlists/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRetired: true }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(updatePlaylist).toHaveBeenCalledWith('pl-1', { name: undefined, eventDate: undefined, isRetired: true }, 'default');
  });

  it('returns 404 when missing', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);
    const request = new Request('http://localhost/api/playlists/pl-x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRetired: true }),
    });
    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'pl-x' }) });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/playlists/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({ id: 'pl-1', name: 'Set', songs: [], isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);

    const request = new Request('http://localhost/api/playlists/pl-1', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    expect(response.status).toBe(204);
    expect(deletePlaylist).toHaveBeenCalledWith('pl-1', 'default');
  });
});
