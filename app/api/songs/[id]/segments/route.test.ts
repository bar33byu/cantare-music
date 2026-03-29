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
  getSegmentsBySongId: vi.fn(),
  upsertSegments: vi.fn(),
}));

import { GET, PUT } from './route';
import { getSegmentsBySongId, upsertSegments } from '../../../../../db/queries';

describe('GET /api/songs/[id]/segments', () => {
  it('returns segments array', async () => {
    const mockSegments = [{ id: '1', label: 'Verse', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments);

    const request = new Request('http://localhost/api/songs/123/segments');
    const response = await GET(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockSegments);
    expect(getSegmentsBySongId).toHaveBeenCalledWith('123');
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
      },
    ];

    const request = new Request('http://localhost/api/songs/123/segments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments }),
    });

    const response = await PUT(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(200);
    expect(upsertSegments).toHaveBeenCalledWith('123', segments);
  });

  it('returns 400 for invalid segments', async () => {
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
});