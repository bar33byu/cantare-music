import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getPlaylistSourceDiff: vi.fn(),
}));

import { GET } from './route';
import { getPlaylistSourceDiff } from '../../../../../db/queries';

describe('GET /api/playlists/[id]/source-diff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns source update details for an owned imported playlist', async () => {
    vi.mocked(getPlaylistSourceDiff).mockResolvedValue({
      importedPlaylistId: 'pl-1',
      sourcePlaylistId: 'source-pl',
      sourceAvailable: true,
      checkedAt: '2026-06-05T12:00:00.000Z',
      counts: { added: 1, removed: 0, changed: 2 },
      orderChanged: true,
      hasChanges: true,
      added: [],
      removed: [],
      changed: [],
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/source-diff');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.counts).toEqual({ added: 1, removed: 0, changed: 2 });
    expect(getPlaylistSourceDiff).toHaveBeenCalledWith('pl-1', 'default');
  });

  it('returns 404 when the playlist is missing', async () => {
    vi.mocked(getPlaylistSourceDiff).mockResolvedValue(null);

    const request = new Request('http://localhost/api/playlists/pl-x/source-diff');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-x' }) });

    expect(response.status).toBe(404);
  });
});
