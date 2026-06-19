import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/queries', () => ({
  addTapPracticeTap: vi.fn(),
  getLatestCompleteMidiAlignmentForSource: vi.fn(),
  getLatestMidiSourceForSong: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  getSongById: vi.fn(),
  getTapPracticeSessionDetail: vi.fn(),
  updateTapPracticeSessionProgress: vi.fn(),
}));

import { GET, POST, PUT } from './route';
import {
  addTapPracticeTap,
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSegmentsBySongId,
  getSongById,
  getTapPracticeSessionDetail,
  updateTapPracticeSessionProgress,
} from '../../../../../../db/queries';

describe('GET /api/songs/[id]/tap-sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tap session detail for matching song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      audioVersion: 'straight',
      mode: 'practice',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as Awaited<ReturnType<typeof getTapPracticeSessionDetail>>);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1');
    const response = await GET(request as Parameters<typeof GET>[0], { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.id).toBe('session-1');
  });

  it('returns 404 when session belongs to a different song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-2',
      audioVersion: 'straight',
      mode: 'practice',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as Awaited<ReturnType<typeof getTapPracticeSessionDetail>>);

    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1');
    const response = await GET(request as Parameters<typeof GET>[0], { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/songs/[id]/tap-sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1',
      songId: 'song-1',
      audioVersion: 'straight',
      mode: 'practice',
      segmentId: 'segment-1',
      startedAt: '2026-04-11T12:00:00.000Z',
      taps: [],
    } as Awaited<ReturnType<typeof getTapPracticeSessionDetail>>);
    vi.mocked(getSegmentsBySongId).mockResolvedValue([{ id: 'segment-1' }] as Awaited<ReturnType<typeof getSegmentsBySongId>>);
    vi.mocked(getLatestMidiSourceForSong).mockResolvedValue(null);
    vi.mocked(getLatestCompleteMidiAlignmentForSource).mockResolvedValue(null);
    vi.mocked(updateTapPracticeSessionProgress).mockResolvedValue(null);
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

    const response = await POST(request as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });

    expect(response.status).toBe(204);
    expect(addTapPracticeTap).toHaveBeenCalledWith('session-1', {
      segmentId: 'segment-1',
      noteId: 'note-1',
      timeOffsetMs: 100,
      durationMs: 90,
      lane: 0.25,
    });
    expect(updateTapPracticeSessionProgress).toHaveBeenCalledWith('session-1', 'default', {
      completedAt: expect.any(Date),
      autoScorePercent: null,
      scoreDetails: null,
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

    const response = await POST(request as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('lane');
    expect(addTapPracticeTap).not.toHaveBeenCalled();
  });
});

describe('PUT /api/songs/[id]/tap-sessions/[sessionId]', () => {
  it('rejects voice snapshots for tap sessions', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as Awaited<ReturnType<typeof getSongById>>);
    vi.mocked(getTapPracticeSessionDetail).mockResolvedValue({
      id: 'session-1', songId: 'song-1', inputMethod: 'tap', audioVersion: 'straight', mode: 'practice', segmentId: 'segment-1', startedAt: new Date().toISOString(), taps: [],
    } as Awaited<ReturnType<typeof getTapPracticeSessionDetail>>);
    const request = new Request('http://localhost/api/songs/song-1/tap-sessions/session-1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempts: [] }),
    });
    const response = await PUT(request as Parameters<typeof PUT>[0], { params: Promise.resolve({ id: 'song-1', sessionId: 'session-1' }) });
    expect(response.status).toBe(400);
    expect(updateTapPracticeSessionProgress).not.toHaveBeenCalled();
  });
});
