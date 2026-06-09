import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../db/queries', () => ({
  isStorageKeyReferenced: vi.fn(),
  promoteDraftRecordingToSongVersion: vi.fn(),
  recordOrphanedAudioKey: vi.fn(),
}));

vi.mock('../../../../../../../lib/r2', () => ({
  deleteObject: vi.fn(),
}));

import { POST } from './route';
import { isStorageKeyReferenced, promoteDraftRecordingToSongVersion, recordOrphanedAudioKey } from '../../../../../../../db/queries';
import { deleteObject } from '../../../../../../../lib/r2';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStorageKeyReferenced).mockResolvedValue(false);
});

describe('POST /api/songs/[id]/draft-recordings/[draftId]/promote', () => {
  it('promotes a draft recording and archives it', async () => {
    const draftRecording = {
      id: 'draft-1',
      songId: 'song-1',
      title: null,
      audioKey: 'audio/song-1/draft.webm',
      status: 'archived' as const,
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: '2026-05-25T14:30:00.000Z',
      archivedAt: '2026-05-25T15:00:00.000Z',
    };
    vi.mocked(promoteDraftRecordingToSongVersion).mockResolvedValue({
      draftRecording,
      previousAudioKey: 'audio/song-1/old.mp3',
    });

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimStartMs: 500.4, trimEndMs: 4199.6 }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(promoteDraftRecordingToSongVersion).toHaveBeenCalledWith('song-1', 'draft-1', { trimStartMs: 500, trimEndMs: 4200 }, 'default');
    expect(deleteObject).toHaveBeenCalledWith('audio/song-1/old.mp3');
    expect(data).toEqual({ draftRecording });
  });

  it('does not delete the promoted draft object', async () => {
    vi.mocked(promoteDraftRecordingToSongVersion).mockResolvedValue({
      draftRecording: {
        id: 'draft-1',
        songId: 'song-1',
        title: null,
        audioKey: 'audio/song-1/draft.webm',
        status: 'archived',
        trimStartMs: null,
        trimEndMs: null,
        createdAt: '2026-05-25T14:30:00.000Z',
        archivedAt: '2026-05-25T15:00:00.000Z',
      },
      previousAudioKey: 'audio/song-1/draft.webm',
    });

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1/promote', {
      method: 'POST',
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });

    expect(response.status).toBe(200);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('does not delete replaced audio that another record still references', async () => {
    vi.mocked(promoteDraftRecordingToSongVersion).mockResolvedValue({
      draftRecording: {
        id: 'draft-1',
        songId: 'song-1',
        title: null,
        audioKey: 'audio/song-1/draft.webm',
        status: 'archived',
        trimStartMs: null,
        trimEndMs: null,
        createdAt: '2026-05-25T14:30:00.000Z',
        archivedAt: '2026-05-25T15:00:00.000Z',
      },
      previousAudioKey: 'audio/shared/old.mp3',
    });
    vi.mocked(isStorageKeyReferenced).mockResolvedValue(true);

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1/promote', {
      method: 'POST',
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });

    expect(response.status).toBe(200);
    expect(isStorageKeyReferenced).toHaveBeenCalledWith('audio/shared/old.mp3');
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('records old song audio as orphaned if cleanup fails', async () => {
    vi.mocked(promoteDraftRecordingToSongVersion).mockResolvedValue({
      draftRecording: {
        id: 'draft-1',
        songId: 'song-1',
        title: null,
        audioKey: 'audio/song-1/draft.webm',
        status: 'archived',
        trimStartMs: 500,
        trimEndMs: 4200,
        createdAt: '2026-05-25T14:30:00.000Z',
        archivedAt: '2026-05-25T15:00:00.000Z',
      },
      previousAudioKey: 'audio/song-1/old.mp3',
    });
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('delete failed'));

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1/promote', {
      method: 'POST',
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });

    expect(response.status).toBe(200);
    expect(recordOrphanedAudioKey).toHaveBeenCalledWith(expect.any(String), 'audio/song-1/old.mp3', 'default');
  });

  it('returns 404 when the active draft is not found', async () => {
    vi.mocked(promoteDraftRecordingToSongVersion).mockResolvedValue(null);

    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/missing/promote', {
      method: 'POST',
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Draft recording not found');
  });

  it('rejects partial trim metadata', async () => {
    const request = new Request('http://localhost/api/songs/song-1/draft-recordings/draft-1/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimStartMs: 500 }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1', draftId: 'draft-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Trim start and end must be provided together');
    expect(promoteDraftRecordingToSongVersion).not.toHaveBeenCalled();
  });
});
