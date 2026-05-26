import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db/queries', () => ({
  assignDraftRecordingToSong: vi.fn(),
  discardUnassignedDraftRecording: vi.fn(),
}));

vi.mock('../../../../lib/r2', () => ({
  getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}));

import { DELETE, PATCH } from './route';
import { assignDraftRecordingToSong, discardUnassignedDraftRecording } from '../../../../db/queries';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/draft-recordings/[draftId]', () => {
  it('assigns an unassigned draft recording to a song', async () => {
    vi.mocked(assignDraftRecordingToSong).mockResolvedValue({
      id: 'draft-1',
      songId: 'song-1',
      title: null,
      audioKey: 'audio/unassigned/user-1/draft.webm',
      status: 'draft',
      trimStartMs: null,
      trimEndMs: null,
      createdAt: '2026-05-26T14:30:00.000Z',
      archivedAt: null,
    });

    const request = new Request('http://localhost/api/draft-recordings/draft-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': 'user-1',
      },
      body: JSON.stringify({ songId: 'song-1' }),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ draftId: 'draft-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(assignDraftRecordingToSong).toHaveBeenCalledWith('draft-1', 'song-1', 'user-1');
    expect(data.draftRecording).toEqual(expect.objectContaining({
      id: 'draft-1',
      songId: 'song-1',
      audioUrl: 'https://cdn.example.com/audio/unassigned/user-1/draft.webm',
    }));
  });

  it('requires a song id', async () => {
    const request = new Request('http://localhost/api/draft-recordings/draft-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request as any, { params: Promise.resolve({ draftId: 'draft-1' }) });

    expect(response.status).toBe(400);
    expect(assignDraftRecordingToSong).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/draft-recordings/[draftId]', () => {
  it('discards an unassigned draft recording', async () => {
    vi.mocked(discardUnassignedDraftRecording).mockResolvedValue({
      id: 'draft-1',
      songId: null,
      title: null,
      audioKey: 'audio/unassigned/user-1/draft.webm',
      status: 'discarded',
      trimStartMs: null,
      trimEndMs: null,
      createdAt: '2026-05-26T14:30:00.000Z',
      archivedAt: '2026-05-26T15:00:00.000Z',
    });

    const request = new Request('http://localhost/api/draft-recordings/draft-1', {
      method: 'DELETE',
      headers: { 'X-User-ID': 'user-1' },
    });

    const response = await DELETE(request as any, { params: Promise.resolve({ draftId: 'draft-1' }) });

    expect(response.status).toBe(200);
    expect(discardUnassignedDraftRecording).toHaveBeenCalledWith('draft-1', 'user-1');
  });
});
