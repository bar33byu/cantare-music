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
  getLatestRatingTimeBySongIds: vi.fn(),
  getSongKnowledgeBySongIds: vi.fn(),
  getSegmentsBySongIds: vi.fn(),
  getMidiContourStatusBySongIds: vi.fn(),
  createSong: vi.fn(),
  getUserById: vi.fn(),
  getUserForSessionTokenHash: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('../../lib/authTokens', () => ({
  AUTH_SESSION_COOKIE_NAME: "cantare-session",
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
}));

import { GET, POST } from './route';
import { getAllSongs, getMidiContourStatusBySongIds, getLatestRatingTimeBySongIds, getSongKnowledgeBySongIds, getSegmentsBySongIds, createSong, getUserForSessionTokenHash } from '../../../db/queries';

describe('GET /api/songs', () => {
  it('returns array of songs', async () => {
    const mockSongs = [{
      id: '1',
      title: 'Song 1',
      artist: null,
      audioKey: null,
      alternateAudioKey: null,
      pitchContourNotes: [{ id: 'n-1', absoluteMs: 0, durationMs: 100, lane: 0.5 }],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      lastPracticedAt: new Date('2024-01-02T00:00:00.000Z'),
      userId: 'default',
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({ '1': 65 });
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({ '1': true });
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({ '1': [
      {
        id: 'seg-1',
        songId: '1',
        label: '1',
        order: 0,
        startMs: 0,
        endMs: 1000,
        lyricText: '',
        pitchContourNotes: [{ id: 'n-1', timeOffsetMs: 0, durationMs: 100, lane: 0.5 }],
      } as any,
    ] });

    const request = new Request('http://localhost/api/songs');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      {
        ...mockSongs[0],
        pitchContourNotes: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        lastPracticedAt: '2024-01-02T00:00:00.000Z',
        masteryPercent: 65,
        hasAudio: false,
        hasPartAudio: false,
        hasBlendAudio: false,
        hasSegments: true,
        hasTapKeys: true,
        hasMidiContour: true,
      },
    ]);
    expect(getAllSongs).toHaveBeenCalledWith('default');
    expect(getLatestRatingTimeBySongIds).toHaveBeenCalledWith(['1'], 'default');
    expect(getSongKnowledgeBySongIds).toHaveBeenCalledWith(['1'], 'default');
    expect(getSegmentsBySongIds).toHaveBeenCalledWith(['1']);
    expect(getMidiContourStatusBySongIds).toHaveBeenCalledWith(['1'], 'default');
  });

  it('uses the signed-in session instead of a client user header', async () => {
    vi.mocked(getAllSongs).mockResolvedValue([]);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({});
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({});
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({});
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({
      id: 'session-user',
      username: 'session-user',
      name: 'Session User',
      email: 'session@example.com',
      profileVisibility: 'private',
    } as any);

    const request = new Request('http://localhost/api/songs', {
      headers: {
        cookie: 'cantare-session=session-token',
        'X-User-ID': 'spoofed-user',
      },
    });

    await GET(request as any);

    expect(getAllSongs).toHaveBeenCalledWith('session-user');
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
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({});
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({});
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({});

    const request = new Request('http://localhost/api/songs');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      {
        ...mockSongs[0],
        pitchContourNotes: [],
        createdAt: '2024-03-10T00:00:00.000Z',
        lastPracticedAt: '2024-03-11T00:00:00.000Z',
        masteryPercent: 0,
        hasAudio: false,
        hasPartAudio: false,
        hasBlendAudio: false,
        hasSegments: false,
        hasTapKeys: false,
        hasMidiContour: false,
      },
    ]);
  });

  it('treats alternate audio as audio readiness', async () => {
    const mockSongs = [{
      id: 'blend-only',
      title: 'Blend Only',
      artist: null,
      audioKey: null,
      alternateAudioKey: 'audio/blend.mp3',
      pitchContourNotes: [],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      lastPracticedAt: null,
      userId: 'default',
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({});
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({ 'blend-only': [] });
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({});

    const response = await GET(new Request('http://localhost/api/songs') as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].hasAudio).toBe(true);
  });

  it('treats imported MIDI sources as MIDI contour readiness', async () => {
    const mockSongs = [{
      id: 'midi-song',
      title: 'MIDI Song',
      artist: null,
      audioKey: null,
      alternateAudioKey: null,
      pitchContourNotes: [],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      lastPracticedAt: null,
      userId: 'default',
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({});
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({ 'midi-song': [] });
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({ 'midi-song': true });

    const response = await GET(new Request('http://localhost/api/songs') as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].hasTapKeys).toBe(true);
    expect(data[0].hasMidiContour).toBe(true);
  });

  it('does not treat legacy segment contour notes as MIDI contour readiness', async () => {
    const mockSongs = [{
      id: 'segment-contour-song',
      title: 'Segment Contour Song',
      artist: null,
      audioKey: null,
      alternateAudioKey: null,
      pitchContourNotes: [],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      lastPracticedAt: null,
      userId: 'default',
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({});
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({});
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({ 'segment-contour-song': [
      {
        id: 'seg-1',
        songId: 'segment-contour-song',
        label: '1',
        order: 0,
        startMs: 0,
        endMs: 1000,
        lyricText: '',
        pitchContourNotes: [{ id: 'tap-1', timeOffsetMs: 0, durationMs: 100, lane: 0.5 }],
      } as any,
    ] });
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({});

    const response = await GET(new Request('http://localhost/api/songs') as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].hasTapKeys).toBe(false);
    expect(data[0].hasMidiContour).toBe(false);
  });

  it('returns empty list when database is not configured', async () => {
    vi.mocked(getAllSongs).mockRejectedValue(new Error('DATABASE_URL environment variable is not set'));

    const request = new Request('http://localhost/api/songs');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('falls back to latest rating time when lastPracticedAt is null', async () => {
    const mockSongs = [{
      id: 'song-9',
      title: 'Song 9',
      artist: null,
      audioKey: null,
      createdAt: new Date('2024-03-10T00:00:00.000Z'),
      lastPracticedAt: null,
    }];
    vi.mocked(getAllSongs).mockResolvedValue(mockSongs as any);
    vi.mocked(getLatestRatingTimeBySongIds).mockResolvedValue({
      'song-9': new Date('2024-03-20T00:00:00.000Z'),
    });
    vi.mocked(getSongKnowledgeBySongIds).mockResolvedValue({ 'song-9': 40 });
    vi.mocked(getSegmentsBySongIds).mockResolvedValue({ 'song-9': [] });
    vi.mocked(getMidiContourStatusBySongIds).mockResolvedValue({});

    const request = new Request('http://localhost/api/songs');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].lastPracticedAt).toBe('2024-03-20T00:00:00.000Z');
    expect(data[0].masteryPercent).toBe(40);
    expect(data[0].hasSegments).toBe(false);
    expect(data[0].hasTapKeys).toBe(false);
  });
});

describe('POST /api/songs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates song and returns 201', async () => {
    const mockSong = { id: 'uuid-123', title: 'New Song', artist: 'Artist', audioKey: null, alternateAudioKey: null, pitchContourNotes: [], createdAt: null, lastPracticedAt: null, userId: 'default' };
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
      userId: 'default',
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
