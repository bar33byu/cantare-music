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
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(listTapPracticeSessionsForSong).mockResolvedValue([
      {
        id: 'session-1',
        songId: 'song-1',
        startedAt: '2026-04-11T12:00:00.000Z',
        tapCount: 7,
      },
    ] as any);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(listTapPracticeSessionsForSong).toHaveBeenCalledWith('song-1', 'default');
  });

  it('returns 404 when song does not exist', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/songs/missing/tap-sessions');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'missing' }) });

    expect(response.status).toBe(404);
    expect(listTapPracticeSessionsForSong).not.toHaveBeenCalled();
  });
});

describe('POST /api/songs/[id]/tap-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans old tap data and creates a new session', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(createTapPracticeSession).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      tapCount: 0,
    } as any);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(deleteExpiredTapPracticeData).toHaveBeenCalledWith('default');
    expect(createTapPracticeSession).toHaveBeenCalledWith('song-1', 'default', expect.any(Date));
    expect(data.session.id).toBe('session-1');
  });
});
