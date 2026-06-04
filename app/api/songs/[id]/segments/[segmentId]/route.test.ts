import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../../../db/queries', () => ({
  getSongById: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
  reorderSegments: vi.fn(),
}));

import { GET, PATCH, DELETE } from './route';
import { getSongById, getSegmentsBySongId, updateSegment, deleteSegment, reorderSegments } from '../../../../../../db/queries';
import { USER_ID_HEADER } from '../../../../../lib/userContext';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song', userId: 'default' } as any);
});

describe('GET /api/songs/[id]/segments/[segmentId]', () => {
  it('returns segment when found', async () => {
    const mockSegments = [
      { id: 'seg-1', label: 'Verse 1', order: 1 },
      { id: 'seg-2', label: 'Chorus', order: 2 },
    ];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ...mockSegments[0], pitchContourNotes: [] });
    expect(getSongById).toHaveBeenCalledWith('song-1', 'default');
    expect(getSegmentsBySongId).toHaveBeenCalledWith('song-1');
  });

  it('checks segment ownership with a guest request user', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      headers: { [USER_ID_HEADER]: 'guest-test-user' },
    });
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });

    expect(response.status).toBe(200);
    expect(getSongById).toHaveBeenCalledWith('song-1', 'guest-test-user');
  });

  it('returns 404 when song does not belong to request user', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      headers: { [USER_ID_HEADER]: 'Test User' },
    });
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
    expect(getSegmentsBySongId).not.toHaveBeenCalled();
  });

  it('returns 404 when segment not found', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-2');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-2' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Segment not found');
  });
});

describe('PATCH /api/songs/[id]/segments/[segmentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song', userId: 'default' } as any);
  });

  it('updates segment successfully', async () => {
    const mockSegments = [
      { id: 'seg-1', label: 'Verse 1', order: 1, startMs: 0, endMs: 1000, lyricText: '' },
      { id: 'seg-2', label: 'Verse 2', order: 2, startMs: 2000, endMs: 3000, lyricText: '' },
    ];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Chorus', startMs: 500 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });

    expect(response.status).toBe(200);
    expect(updateSegment).toHaveBeenCalledWith('seg-1', { label: 'Chorus', startMs: 500 });
    expect(reorderSegments).toHaveBeenCalledWith([
      { id: 'seg-1', order: 0 },
      { id: 'seg-2', order: 1 },
    ]);
  });

  it('ignores provided order field for ranking semantics', async () => {
    const mockSegments = [
      { id: 'seg-1', label: 'Verse 1', order: 0, startMs: 0, endMs: 1000, lyricText: '' },
      { id: 'seg-2', label: 'Verse 2', order: 1, startMs: 2000, endMs: 3000, lyricText: '' },
    ];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: 99, endMs: 2500 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });

    expect(response.status).toBe(200);
    expect(updateSegment).toHaveBeenCalledWith('seg-1', { endMs: 2500 });
    expect(reorderSegments).toHaveBeenCalledWith([
      { id: 'seg-1', order: 0 },
      { id: 'seg-2', order: 1 },
    ]);
  });

  it('returns 404 when segment not found', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Chorus' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-2' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Segment not found');
  });

  it('returns 400 for invalid label type', async () => {
    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 123 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Label must be a string');
  });

  it('ignores legacy pitch contour notes when they are the only update', async () => {
    const mockSegments = [
      { id: 'seg-1', label: 'Verse 1', order: 0, startMs: 0, endMs: 1000, lyricText: '', pitchContourNotes: [] },
    ];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 100, durationMs: 400, lane: 0.65 }],
      }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('No valid fields to update');
    expect(updateSegment).not.toHaveBeenCalled();
    expect(reorderSegments).not.toHaveBeenCalled();
  });

  it('returns 400 when no valid fields to update', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1, startMs: 0, endMs: 1000, lyricText: '' }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalidField: 'value' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('No valid fields to update');
  });

  it('does not trigger reorder for label-only update', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 0, startMs: 0, endMs: 1000, lyricText: '' }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);
    vi.mocked(updateSegment).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Updated label' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });

    expect(response.status).toBe(200);
    expect(updateSegment).toHaveBeenCalledWith('seg-1', { label: 'Updated label' });
    expect(reorderSegments).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/songs/[id]/segments/[segmentId]', () => {
  it('deletes segment successfully', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-1' }) });

    expect(response.status).toBe(200);
    expect(deleteSegment).toHaveBeenCalledWith('seg-1');
  });

  it('returns 404 when segment not found', async () => {
    const mockSegments = [{ id: 'seg-1', label: 'Verse 1', order: 1 }];
    vi.mocked(getSegmentsBySongId).mockResolvedValue(mockSegments as any);

    const request = new Request('http://localhost/api/songs/song-1/segments/seg-2', {
      method: 'DELETE',
    });

    const response = await DELETE(request as any, { params: Promise.resolve({ id: 'song-1', segmentId: 'seg-2' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Segment not found');
  });
});
