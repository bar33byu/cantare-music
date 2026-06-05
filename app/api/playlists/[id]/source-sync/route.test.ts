import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  resyncPlaylistFromSource: vi.fn(),
}));

import { POST } from './route';
import { resyncPlaylistFromSource } from '../../../../../db/queries';

const diff = {
  importedPlaylistId: 'pl-1',
  sourcePlaylistId: 'source-pl',
  sourceAvailable: true,
  checkedAt: '2026-06-05T12:00:00.000Z',
  counts: { added: 0, removed: 0, changed: 0 },
  orderChanged: false,
  hasChanges: false,
  added: [],
  removed: [],
  changed: [],
};

describe('POST /api/playlists/[id]/source-sync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs a selected source sync mode', async () => {
    vi.mocked(resyncPlaylistFromSource).mockResolvedValue({
      mode: 'full',
      importedPlaylistId: 'pl-1',
      applied: { added: 1, updated: 2, removedFromPlaylist: 0, orderUpdated: true },
      diffBefore: { ...diff, hasChanges: true, counts: { added: 1, removed: 0, changed: 2 }, orderChanged: true },
      diffAfter: diff,
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/source-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'full' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.applied).toEqual({ added: 1, updated: 2, removedFromPlaylist: 0, orderUpdated: true });
    expect(resyncPlaylistFromSource).toHaveBeenCalledWith('pl-1', 'default', 'full');
  });

  it('rejects invalid modes', async () => {
    const request = new Request('http://localhost/api/playlists/pl-1/source-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'everything' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(400);
    expect(resyncPlaylistFromSource).not.toHaveBeenCalled();
  });

  it('returns conflict when the source is unavailable', async () => {
    vi.mocked(resyncPlaylistFromSource).mockResolvedValue({
      mode: 'full',
      importedPlaylistId: 'pl-1',
      applied: { added: 0, updated: 0, removedFromPlaylist: 0, orderUpdated: false },
      diffBefore: { ...diff, sourceAvailable: false },
      diffAfter: { ...diff, sourceAvailable: false },
    } as any);

    const request = new Request('http://localhost/api/playlists/pl-1/source-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'full' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'pl-1' }) });

    expect(response.status).toBe(409);
  });
});
