import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/queries', () => ({
  getAllPlaylists: vi.fn(),
  createPlaylist: vi.fn(),
}));

import { GET, POST } from './route';
import { createPlaylist, getAllPlaylists } from '../../../db/queries';

describe('GET /api/playlists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns playlists', async () => {
    vi.mocked(getAllPlaylists).mockResolvedValue([{ id: 'pl-1', name: 'Set', isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' }] as any);

    const request = new Request('http://localhost/api/playlists');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.playlists).toHaveLength(1);
    expect(getAllPlaylists).toHaveBeenCalledWith(false);
  });

  it('supports includeRetired query param', async () => {
    vi.mocked(getAllPlaylists).mockResolvedValue([] as any);
    const request = new Request('http://localhost/api/playlists?includeRetired=true');
    await GET(request as any);
    expect(getAllPlaylists).toHaveBeenCalledWith(true);
  });
});

describe('POST /api/playlists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates playlist with valid payload', async () => {
    vi.mocked(createPlaylist).mockResolvedValue({ id: 'pl-1', name: 'Set', isRetired: false, createdAt: '2026-01-01T00:00:00.000Z' } as any);

    const request = new Request('http://localhost/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Set', eventDate: '2026-04-04' }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(201);
    expect(createPlaylist).toHaveBeenCalledWith({ name: 'Set', eventDate: '2026-04-04' });
  });

  it('returns 400 when name is missing', async () => {
    const request = new Request('http://localhost/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventDate: '2026-04-04' }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('name is required');
  });
});
