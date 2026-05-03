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
  getSegmentsBySongId: vi.fn(),
  upsertSegments: vi.fn(),
  createSegment: vi.fn(),
  reorderSegments: vi.fn(),
}));

import { GET, PUT, POST, PATCH } from './route';
import { getSongById, getSegmentsBySongId, upsertSegments, createSegment, reorderSegments } from '../../../../../db/queries';

describe('GET /api/songs/[id]/segments', () => {
  it('returns segments array', async () => {
    const mockSegments = [{ id: '1', label: 'Verse', order: 1 }];
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/123/segments');
    const response = await GET(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockSegments);
    expect(getSegmentsBySongId).toHaveBeenCalledWith('123');
  });
});

describe('POST /api/songs/[id]/segments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates segment successfully without requiring order', async () => {
    const newSegment = {
      id: 'seg-1',
      label: 'Verse 1',
      startMs: 0,
      endMs: 1000,
      lyricText: 'Lyrics here',
      pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 100, durationMs: 300, lane: 0.7 }],
    };
    const existingSegments = [
      {
        id: 'seg-older',
        songId: 'song-1',
        label: 'Intro',
        order: 0,
        startMs: 0,
        endMs: 500,
        lyricText: '',
      },
    ];
    const createdSegment = { ...newSegment, songId: 'song-1', order: 1 };

    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song 1' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue(existingSegments as any);
    vi.mocked(createSegment).mockResolvedValue(createdSegment as any);
    vi.mocked(reorderSegments).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/song-1/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSegment),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ ...createdSegment, order: 1 });
    expect(getSegmentsBySongId).toHaveBeenCalledWith('song-1');
    expect(createSegment).toHaveBeenCalledWith({
      id: 'seg-1',
      songId: 'song-1',
      label: 'Verse 1',
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: 'Lyrics here',
      pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 100, durationMs: 300, lane: 0.7 }],
    });
    expect(reorderSegments).toHaveBeenCalledWith([
      { id: 'seg-older', order: 0 },
      { id: 'seg-1', order: 1 },
    ]);
  });

  it('ignores provided order and infers timeline-based order', async () => {
    const requestBody = {
      id: 'seg-2',
      label: 'Middle',
      order: 99,
      startMs: 2000,
      endMs: 2500,
      lyricText: 'middle section',
    };

    const existingSegments = [
      {
        id: 'seg-1',
        songId: 'song-1',
        label: 'Intro',
        order: 0,
        startMs: 0,
        endMs: 1000,
        lyricText: '',
      },
      {
        id: 'seg-3',
        songId: 'song-1',
        label: 'Outro',
        order: 1,
        startMs: 4000,
        endMs: 5000,
        lyricText: '',
      },
    ];
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song 1' } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue(existingSegments as any);
    vi.mocked(createSegment).mockResolvedValue({ ...requestBody, songId: 'song-1', order: 1 } as any);
    vi.mocked(reorderSegments).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/song-1/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });

    expect(response.status).toBe(201);
    expect(createSegment).toHaveBeenCalledWith({
      id: 'seg-2',
      songId: 'song-1',
      label: 'Middle',
      order: 1,
      startMs: 2000,
      endMs: 2500,
      lyricText: 'middle section',
    });
    expect(reorderSegments).toHaveBeenCalledWith([
      { id: 'seg-1', order: 0 },
      { id: 'seg-2', order: 1 },
      { id: 'seg-3', order: 2 },
    ]);
  });

  it('returns 400 for missing id', async () => {
    const request = new Request('http://localhost/api/songs/song-1/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Verse 1', order: 1 }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Segment ID is required and must be a string');
  });

  it('returns 400 for invalid startMs type', async () => {
    const request = new Request('http://localhost/api/songs/song-1/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'seg-1',
        label: 'Verse 1',
        startMs: 'invalid',
        endMs: 1000,
        lyricText: 'Lyrics here',
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Start time is required and must be a number');
  });

  it('returns 400 for invalid pitch contour notes', async () => {
    const request = new Request('http://localhost/api/songs/song-1/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'seg-1',
        label: 'Verse 1',
        startMs: 0,
        endMs: 1000,
        lyricText: 'Lyrics here',
        pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 10, durationMs: 20, lane: 2 }],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Each pitch contour note must include');
  });
});

describe('PUT /api/songs/[id]/segments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls upsertSegments', async () => {
    const segments = [
      {
        id: 'seg-1',
        label: 'Verse 1',
        order: 1,
        startMs: 0,
        endMs: 1000,
        lyricText: 'Lyrics here',
        pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 50, durationMs: 80, lane: 0.4 }],
      },
    ];

    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
    const request = new Request('http://localhost/api/songs/123/segments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments }),
    });

    const response = await PUT(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(200);
    expect(upsertSegments).toHaveBeenCalledWith('123', segments);
  });

  it('returns 400 for invalid pitch contour notes in PUT payload', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
    const request = new Request('http://localhost/api/songs/123/segments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: [
          {
            id: 'seg-1',
            label: 'Verse 1',
            order: 1,
            startMs: 0,
            endMs: 1000,
            lyricText: 'Lyrics here',
            pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 50, durationMs: -10, lane: 0.4 }],
          },
        ],
      }),
    });

    const response = await PUT(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Each pitch contour note must include');
  });

  it('returns 400 for invalid segments', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
    const request = new Request('http://localhost/api/songs/123/segments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments: 'not-an-array' }),
    });

    const response = await PUT(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Segments must be an array');
  });

  describe('PATCH /api/songs/[id]/segments', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('calls reorderSegments and returns 200 for valid body', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      vi.mocked(reorderSegments).mockResolvedValue(undefined);

      const body = [
        { id: 'seg-1', order: 0 },
        { id: 'seg-2', order: 1 },
      ];
      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ ok: true });
      expect(reorderSegments).toHaveBeenCalledWith([
        { id: 'seg-1', order: 0 },
        { id: 'seg-2', order: 1 },
      ]);
    });

    it('returns 400 when body is not an array', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'seg-1', order: 0 }),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Body must be an array');
    });

    it('returns 400 when an item is missing id', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ order: 0 }]),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Each item must have a string id');
    });

    it('returns 400 when order is negative', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: 'seg-1', order: -1 }]),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Each item must have a non-negative integer order');
    });

    it('returns 400 when order is not an integer', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: 'seg-1', order: 1.5 }]),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Each item must have a non-negative integer order');
    });

    it('returns 500 when reorderSegments throws', async () => {
      vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 123' } as any);
      vi.mocked(reorderSegments).mockRejectedValue(new Error('DB error'));

      const request = new Request('http://localhost/api/songs/123/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: 'seg-1', order: 0 }]),
      });

      const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });

      expect(response.status).toBe(500);
    });
  });
});
