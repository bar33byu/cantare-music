import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  createDraftRecording: vi.fn(),
  getSongById: vi.fn(),
}));

import { POST } from './route';
import { createDraftRecording, getSongById } from '../../../../../db/queries';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/songs/[id]/draft-recordings', () => {
  it('creates a draft recording for the song', async () => {
    const draftRecording = {
      id: 'draft-1',
      songId: 'song-1',
      title: null,
      audioKey: 'audio/song-1/draft/recording.webm',
      status: 'draft' as const,
      createdAt: '2026-05-25T14:30:00.000Z',
    };
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1' } as any);
    vi.mocked(createDraftRecording).mockResolvedValue(draftRecording);

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey: 'audio/song-1/draft/recording.webm' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ draftRecording });
    expect(createDraftRecording).toHaveBeenCalledWith({
      songId: 'song-1',
      audioKey: 'audio/song-1/draft/recording.webm',
      title: null,
    }, 'default');
  });

  it('returns 400 when audioKey is missing', async () => {
    const request = new Request('http://localhost/api/songs/song-1/draft-recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Audio key is required');
    expect(createDraftRecording).not.toHaveBeenCalled();
  });

  it('returns 404 when the song does not exist', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);
    const request = new Request('http://localhost/api/songs/song-1/draft-recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey: 'audio/song-1/draft/recording.webm' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Song not found');
    expect(createDraftRecording).not.toHaveBeenCalled();
  });
});
