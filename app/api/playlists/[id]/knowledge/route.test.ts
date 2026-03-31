import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  getPlaylistById: vi.fn(),
  getRatingsForSong: vi.fn(),
}));

vi.mock('../../../../lib/knowledgeUtils', () => ({
  computePlaylistKnowledge: vi.fn(() => 0.72),
}));

import { GET } from './route';
import { getPlaylistById, getRatingsForSong } from '../../../../../db/queries';
import { computePlaylistKnowledge } from '../../../../lib/knowledgeUtils';

describe('GET /api/playlists/[id]/knowledge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns score for a playlist', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue({
      id: 'pl-1',
      name: 'Set',
      songs: [
        { id: 'song-1', title: 'Song 1', segments: [], audioUrl: '', createdAt: '2026-01-01T00:00:00.000Z', position: 0 },
      ],
      isRetired: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    } as any);
    vi.mocked(getRatingsForSong).mockResolvedValue([] as any);

    const request = new Request('http://localhost/api/playlists/pl-1/knowledge');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.score).toBe(0.72);
    expect(computePlaylistKnowledge).toHaveBeenCalled();
  });

  it('returns 404 when playlist missing', async () => {
    vi.mocked(getPlaylistById).mockResolvedValue(null);

    const request = new Request('http://localhost/api/playlists/pl-x/knowledge');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'pl-x' }) });

    expect(response.status).toBe(404);
  });
});
