import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../db/queries', () => ({
  updateDraftRecordingTrim: vi.fn(),
}));

import { PATCH } from './route';
import { updateDraftRecordingTrim } from '../../../../../../db/queries';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/songs/[id]/draft-recordings/[draftId]', () => {
  it('updates non-destructive trim metadata', async () => {
    const draftRecording = {
      id: 'draft-1',
      songId: 'song-1',
      title: null,
      audioKey: 'audio/song-1/draft.webm',
      status: 'draft' as const,
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: '2026-05-25T14:30:00.000Z',
    };
    vi.mocked(updateDraftRecordingTrim).mockResolvedValue(draftRecording);

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimStartMs: 500.4, trimEndMs: 4199.6 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(updateDraftRecordingTrim).toHaveBeenCalledWith('song-1', 'draft-1', { trimStartMs: 500, trimEndMs: 4200 }, 'default');
    expect(data).toEqual({ draftRecording });
  });

  it('rejects an invalid trim range', async () => {
    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimStartMs: 5000, trimEndMs: 5000 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Trim end must be after trim start');
    expect(updateDraftRecordingTrim).not.toHaveBeenCalled();
  });

  it('returns 404 when draft is not found', async () => {
    vi.mocked(updateDraftRecordingTrim).mockResolvedValue(null);
    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/missing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimStartMs: 0, trimEndMs: 1000 }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Draft recording not found');
  });
});
