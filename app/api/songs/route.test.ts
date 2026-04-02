import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../db/queries', () => ({
  getAllSongs: vi.fn(),
  createSong: vi.fn(),
}));

import { GET, POST } from './route';
import { getAllSongs, createSong } from '../../../db/queries';

describe('GET /api/songs', () => {
  it('returns array of songs', async () => {
    const mockSongs = [{
      id: '1',
      title: 'Song 1',
      artist: null,
      audioKey: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      lastPracticedAt: new Date('2024-01-02T00:00:00.000Z'),
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      {
        ...mockSongs[0],
        createdAt: '2024-01-01T00:00:00.000Z',
        lastPracticedAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    expect(getAllSongs).toHaveBeenCalled();
  });

  it('handles string timestamps from the database', async () => {
    const mockSongs = [{
      id: '2',
      title: 'Song 2',
      artist: null,
      audioKey: null,
      createdAt: '2024-03-10T00:00:00.000Z',
      lastPracticedAt: '2024-03-11T00:00:00.000Z',
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      {
        ...mockSongs[0],
        createdAt: '2024-03-10T00:00:00.000Z',
        lastPracticedAt: '2024-03-11T00:00:00.000Z',
      },
    ]);
  });
});

describe('POST /api/songs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates song and returns 201', async () => {
    const mockSong = { id: 'uuid-123', title: 'New Song', artist: 'Artist' };
    vi.mocked(createSong).mockResolvedValue(mockSong);

    const request = new Request('http://localhost/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Song', artist: 'Artist' }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual(mockSong);
    expect(createSong).toHaveBeenCalledWith({
      id: expect.any(String),
      title: 'New Song',
      artist: 'Artist',
    });
  });

  it('returns 400 for invalid title', async () => {
    const request = new Request('http://localhost/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 123 }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Title is required');
  });
});