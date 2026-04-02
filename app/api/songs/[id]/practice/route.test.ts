import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getSongById: vi.fn(),
  markSongPracticed: vi.fn(),
}));

import { POST } from './route';
import { getSongById, markSongPracticed } from '../../../../../db/queries';

describe('POST /api/songs/[id]/practice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and updates last practiced timestamp for existing song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song 1' } as any);

    const request = new Request('http://localhost/api/songs/song-1/practice', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });

    expect(response.status).toBe(204);
    expect(markSongPracticed).toHaveBeenCalledWith('song-1', expect.any(Date));
  });

  it('returns 404 when song does not exist', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/missing/practice', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
    expect(markSongPracticed).not.toHaveBeenCalled();
  });
});
