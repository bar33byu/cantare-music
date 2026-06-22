import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  createTapPracticeSession: vi.fn(),
  deleteExpiredTapPracticeData: vi.fn(),
  getSongById: vi.fn(),
  listTapPracticeSessionsForSong: vi.fn(),
}));

import { GET, POST } from './route';
import {
  createTapPracticeSession,
  deleteExpiredTapPracticeData,
  getSongById,
  listTapPracticeSessionsForSong,
} from '../../../../../db/queries';

describe('GET /api/songs/[id]/tap-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tap sessions for a song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(listTapPracticeSessionsForSong).mockResolvedValue([
      {
        id: 'session-1',
        songId: 'song-1',
        startedAt: '2026-04-11T12:00:00.000Z',
        tapCount: 7,
      },
    ] as Awaited<ReturnType<typeof listTapPracticeSessionsForSong>>);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions');
    const response = await GET(request as Parameters<typeof GET>[0], { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(listTapPracticeSessionsForSong).toHaveBeenCalledWith('song-1', 'default');
  });

  it('returns 404 when song does not exist', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/missing/tap-sessions');
    const response = await GET(request as Parameters<typeof GET>[0], { params: Promise.resolve({ id: 'missing' }) });

    expect(response.status).toBe(404);
    expect(listTapPracticeSessionsForSong).not.toHaveBeenCalled();
  });
});

describe('POST /api/songs/[id]/tap-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans old tap data and creates a new session', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(createTapPracticeSession).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      tapCount: 0,
    } as Awaited<ReturnType<typeof createTapPracticeSession>>);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions', { method: 'POST' });
    const response = await POST(request as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(deleteExpiredTapPracticeData).toHaveBeenCalledWith('default');
    expect(createTapPracticeSession).toHaveBeenCalledWith('song-1', 'default', expect.any(Date), {
      audioVersion: 'straight',
      mode: 'practice',
      segmentId: undefined,
    });
    expect(data.session.id).toBe('session-1');
  });

  it('always creates practice sessions even if an old answer-key mode is requested', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(createTapPracticeSession).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      tapCount: 0,
    } as Awaited<ReturnType<typeof createTapPracticeSession>>);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'answer_key' }),
    });
    const response = await POST(request as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'song-1' }) });

    expect(response.status).toBe(201);
    expect(createTapPracticeSession).toHaveBeenCalledWith('song-1', 'default', expect.any(Date), {
      audioVersion: 'straight',
      mode: 'practice',
      segmentId: undefined,
    });
  });

  it('creates a voice session for Sing mode', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(createTapPracticeSession).mockResolvedValue({ id: 'voice-1', songId: 'song-1', startedAt: new Date().toISOString(), tapCount: 0 } as Awaited<ReturnType<typeof createTapPracticeSession>>);
    const request = new Request('http://localhost/api/songs/song-1/tap-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segmentId: 'segment-1', inputMethod: 'voice' }),
    });
    const response = await POST(request as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'song-1' }) });
    expect(response.status).toBe(201);
    expect(createTapPracticeSession).toHaveBeenCalledWith('song-1', 'default', expect.any(Date), expect.objectContaining({
      segmentId: 'segment-1',
      inputMethod: 'voice',
    }));
  });
});
