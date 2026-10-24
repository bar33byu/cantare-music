import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../../db/queries', () => ({
  getSongById: vi.fn(),
  getRatingsForSong: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  saveRatings: vi.fn(),
  markSongPracticed: vi.fn(),
  updateMemoryReview: vi.fn().mockResolvedValue(null),
}));

import { GET, POST } from './route';
import { getSongById, getRatingsForSong, getSegmentsBySongId, saveRatings, markSongPracticed, updateMemoryReview } from '../../../../../db/queries';

describe('GET /api/songs/[id]/ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ratings for a song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Test Song' } as any);
    vi.mocked(getRatingsForSong).mockResolvedValue([
      {
        id: 'rating-1',
        segmentId: 'segment-1',
        rating: 5,
        ratedAt: '2026-03-31T12:00:00.000Z',
      },
    ] as any);

    const request = new Request('http://localhost/api/songs/song-1/ratings');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ratings: [
        {
          id: 'rating-1',
          segmentId: 'segment-1',
          rating: 5,
          ratedAt: '2026-03-31T12:00:00.000Z',
        },
      ],
    });
    expect(getRatingsForSong).toHaveBeenCalledWith('song-1', 'default');
  });

  it('returns 404 when song does not exist', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/missing/ratings');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
  });
});

describe('POST /api/songs/[id]/ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves valid ratings and returns 204', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Test Song' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([
      { id: 'segment-1', songId: 'song-1' },
      { id: 'segment-2', songId: 'song-1' },
    ] as any);

    const request = new Request('http://localhost/api/songs/song-1/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: [
          {
            segmentId: 'segment-1',
            rating: 4,
            ratedAt: '2026-03-31T12:00:00.000Z',
          },
        ],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });

    expect(response.status).toBe(204);
    expect(saveRatings).toHaveBeenCalledWith('song-1', 'default', [
      {
        segmentId: 'segment-1',
        rating: 4,
        ratedAt: new Date('2026-03-31T12:00:00.000Z'),
      },
    ]);
    expect(markSongPracticed).toHaveBeenCalledWith('song-1', 'default', expect.any(Date));
  });

  it('returns 400 for invalid rating value', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Test Song' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1', songId: 'song-1' }] as any);

    const request = new Request('http://localhost/api/songs/song-1/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: [
          {
            segmentId: 'segment-1',
            rating: 6,
            ratedAt: '2026-03-31T12:00:00.000Z',
          },
        ],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Each rating must be an integer between 1 and 5');
  });

  it('returns 400 when segment does not belong to song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Test Song' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1', songId: 'song-1' }] as any);

    const request = new Request('http://localhost/api/songs/song-1/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: [
          {
            segmentId: 'segment-999',
            rating: 4,
            ratedAt: '2026-03-31T12:00:00.000Z',
          },
        ],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Each rating segmentId must belong to this song');
  });
  it('keeps an untouched old five at four while accepting a newly confirmed five', async () => {
    const ratedAt = '2026-01-01T12:00:00.000Z';
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', memoryReview: {
      startedAt: '2026-10-24T12:00:00Z', segments: [{ segmentId: 'segment-1', ratedAt }],
    } } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1' }] as any);
    for (const [timestamp, expected] of [[ratedAt, 4], ['2026-10-24T12:01:00.000Z', 5]] as const) {
      const request = new Request('http://localhost/api/songs/song-1/ratings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings: [{ segmentId: 'segment-1', rating: 5, ratedAt: timestamp }] }),
      });
      expect((await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) })).status).toBe(204);
      expect(saveRatings).toHaveBeenLastCalledWith('song-1', 'default', [{ segmentId: 'segment-1', rating: expected, ratedAt: new Date(timestamp) }]);
    }
  });

  it('applies an overdue reset before an offline rehearsal updates the practice date', async () => {
    const ratedAt = '2026-01-01T12:00:00.000Z';
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', lastPracticedAt: new Date(ratedAt), memoryReview: null } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1' }] as any);
    vi.mocked(updateMemoryReview).mockResolvedValue({ state: {
      startedAt: new Date().toISOString(), segments: [{ segmentId: 'segment-1', ratedAt }],
    } } as any);
    const request = new Request('http://localhost/api/songs/song-1/ratings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings: [{ segmentId: 'segment-1', rating: 5, ratedAt }] }),
    });
    expect((await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) })).status).toBe(204);
    expect(updateMemoryReview).toHaveBeenCalledWith('song-1', 'default');
    expect(saveRatings).toHaveBeenLastCalledWith('song-1', 'default', [{ segmentId: 'segment-1', rating: 4, ratedAt: new Date(ratedAt) }]);
    expect(vi.mocked(updateMemoryReview).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(markSongPracticed).mock.invocationCallOrder[0]);
    vi.mocked(updateMemoryReview).mockResolvedValue(null);
  });

});
