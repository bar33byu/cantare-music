import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/queries', () => ({
  addTapPracticeTap: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  getSongById: vi.fn(),
  getTapPracticeSessionDetail: vi.fn(),
}));

import { GET, POST } from './route';
import {
  addTapPracticeTap,
  getSegmentsBySongId,
  getSongById,
  getTapPracticeSessionDetail,
} from '../../../../../../db/queries';

describe('GET /api/songs/[id]/tap-sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tap session detail for matching song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as any);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.id).toBe('session-1');
  });

  it('returns 404 when session belongs to a different song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-2',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as any);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1');
    const response = await GET(request as any, { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/songs/[id]/tap-sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as any);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1' }] as any);
  });

  it('persists a valid tap payload', async () => {
    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segmentId: 'segment-1',
        noteId: 'note-1',
        timeOffsetMs: 100,
        durationMs: 90,
        lane: 0.25,
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });

    expect(response.status).toBe(204);
    expect(addTapPracticeTap).toHaveBeenCalledWith('session-1', {
      segmentId: 'segment-1',
      noteId: 'note-1',
      timeOffsetMs: 100,
      durationMs: 90,
      lane: 0.25,
    });
  });

  it('returns 400 for invalid lane', async () => {
    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segmentId: 'segment-1',
        noteId: 'note-1',
        timeOffsetMs: 100,
        durationMs: 90,
        lane: 2,
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('lane');
    expect(addTapPracticeTap).not.toHaveBeenCalled();
  });
});
