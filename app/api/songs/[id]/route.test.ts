import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../db/queries', () => ({
  getSongById: vi.fn(),
  deleteSong: vi.fn(),
  updateSong: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  recordOrphanedAudioKey: vi.fn(),
}));

vi.mock('../../../../lib/r2', () => ({
  deleteObject: vi.fn(),
  getPublicUrl: vi.fn(),
}));

import { GET, DELETE, PATCH } from './route';
import { getSongById, deleteSong, updateSong, getSegmentsBySongId } from '../../../../db/queries';
import { deleteObject, getPublicUrl } from '../../../../lib/r2';

describe('GET /api/songs/[id]', () => {
  it('returns song by id', async () => {
    const mockSong = {
      id: '123',
      title: 'Song 1',
      artist: 'Artist',
      audioKey: 'key.mp3',
      createdAt: new Date('2023-01-01'),
      lastPracticedAt: new Date('2023-01-04'),
    };
    const mockSegments = [{ id: 'seg1', songId: '123', label: 'Verse', order: 0, startMs: 0, endMs: 1000, lyricText: 'lyrics', pitchContourNotes: [] }];
    vi.mocked(getSongById).mockResolvedValue(mockSong);
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments);
    vi.mocked(getPublicUrl).mockReturnValue('https://example.com/key.mp3');

    const request = new Request('http://localhost/api/songs/123');
    const response = await GET(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '123',
      title: 'Song 1',
      artist: 'Artist',
      audioUrl: 'https://example.com/key.mp3',
      segments: [{
        id: 'seg1',
        songId: '123',
        order: 0,
        label: 'Verse',
        lyricText: 'lyrics',
        startMs: 0,
        endMs: 1000,
        pitchContourNotes: [],
      }],
      createdAt: '2023-01-01T00:00:00.000Z',
      lastPracticedAt: '2023-01-04T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    });
    expect(getSongById).toHaveBeenCalledWith('123');
    expect(getSegmentsBySongId).toHaveBeenCalledWith('123');
  });

  it('returns 404 if song not found', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/123');
    const response = await GET(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
  });
});

describe('DELETE /api/songs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and calls deleteObject if audioKey exists', async () => {
    const mockSong = { id: '123', title: 'Song 1', audioKey: 'key-123', artist: null, createdAt: null, lastPracticedAt: null };
    vi.mocked(getSongById).mockResolvedValue(mockSong);

    const request = new Request('http://localhost/api/songs/123', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(204);
    expect(deleteObject).toHaveBeenCalledWith('key-123');
    expect(deleteSong).toHaveBeenCalledWith('123');
  });

  it('returns 204 without calling deleteObject if no audioKey', async () => {
    const mockSong = { id: '123', title: 'Song 1', artist: null, audioKey: null, createdAt: null, lastPracticedAt: null };
    vi.mocked(getSongById).mockResolvedValue(mockSong);

    const request = new Request('http://localhost/api/songs/123', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(204);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteSong).toHaveBeenCalledWith('123');
  });

  it('returns 204 and still deletes song when deleteObject fails', async () => {
    const mockSong = { id: '123', title: 'Song 1', audioKey: 'key-123', artist: null, createdAt: null, lastPracticedAt: null };
    vi.mocked(getSongById).mockResolvedValue(mockSong);
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('SignatureDoesNotMatch'));

    const request = new Request('http://localhost/api/songs/123', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(204);
    expect(response.headers.get('x-audio-cleanup-warning')).toBe('true');
    expect(deleteObject).toHaveBeenCalledWith('key-123');
    expect(deleteSong).toHaveBeenCalledWith('123');
  });

  it('returns 404 if song not found', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/123', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
  });
});

describe('PATCH /api/songs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with audioKey updates only audioKey', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 1', audioKey: 'old-key' } as any);

    const request = new Request('http://localhost/api/songs/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey: 'new-key' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(200);
    expect(updateSong).toHaveBeenCalledWith('123', { audioKey: 'new-key' });
    expect(deleteObject).toHaveBeenCalledWith('old-key');
  });

  it('does not delete object when audioKey does not change', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 1', audioKey: 'same-key' } as any);

    const request = new Request('http://localhost/api/songs/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey: 'same-key' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(200);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown song', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/unknown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey: 'new-key' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'unknown' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
  });

  it('returns 400 for no valid fields', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: '123', title: 'Song 1', audioKey: 'old-key' } as any);

    const request = new Request('http://localhost/api/songs/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalidField: 'value' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('No valid fields to update');
  });
});