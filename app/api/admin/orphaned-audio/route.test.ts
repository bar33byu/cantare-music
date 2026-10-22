import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { getOrphanedAudioKeys, deleteOrphanedAudioKey, isStorageKeyReferenced } from '../../../../db/queries';
import { deleteObject } from '../../../../lib/r2';
import { resolveEffectiveRequestUserId } from '../../_user';

vi.mock('../../../../db/queries', () => ({
  getOrphanedAudioKeys: vi.fn(),
  deleteOrphanedAudioKey: vi.fn(),
  isStorageKeyReferenced: vi.fn(),
}));
vi.mock('../../../../lib/r2', () => ({ deleteObject: vi.fn() }));
vi.mock('../../_user', () => ({ resolveEffectiveRequestUserId: vi.fn() }));

const orphan = { id: 'orphan-1', userId: 'user-1', audioKey: 'audio/shared/song.mp3', failedAt: null };
const request = () => new NextRequest('http://localhost/api/admin/orphaned-audio', { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveEffectiveRequestUserId).mockResolvedValue('user-1');
  vi.mocked(getOrphanedAudioKeys).mockResolvedValue([orphan]);
  vi.mocked(isStorageKeyReferenced).mockResolvedValue(false);
});

describe('POST /api/admin/orphaned-audio', () => {
  it('preserves referenced files and their retry entries, checking across all users', async () => {
    vi.mocked(isStorageKeyReferenced).mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(getOrphanedAudioKeys).toHaveBeenCalledWith('user-1');
    expect(isStorageKeyReferenced).toHaveBeenCalledExactlyOnceWith(orphan.audioKey);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteOrphanedAudioKey).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ results: [{ id: orphan.id, audioKey: orphan.audioKey, status: 'skipped' }] });
  });

  it('deletes an unreferenced file before removing its retry entry', async () => {
    const response = await POST(request());

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(orphan.audioKey);
    expect(isStorageKeyReferenced).toHaveBeenCalledBefore(vi.mocked(deleteObject));
    expect(deleteObject).toHaveBeenCalledBefore(vi.mocked(deleteOrphanedAudioKey));
    expect(deleteOrphanedAudioKey).toHaveBeenCalledWith(orphan.id, 'user-1');
    expect(await response.json()).toEqual({ results: [{ id: orphan.id, audioKey: orphan.audioKey, status: 'deleted' }] });
  });

  it('retains the file and retry entry when reference checking fails', async () => {
    vi.mocked(isStorageKeyReferenced).mockRejectedValue(new Error('Database unavailable'));

    const response = await POST(request());

    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteOrphanedAudioKey).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ results: [{ id: orphan.id, audioKey: orphan.audioKey, status: 'failed', error: 'Database unavailable' }] });
  });

  it('retains the retry entry when storage deletion fails', async () => {
    vi.mocked(deleteObject).mockRejectedValue(new Error('Storage unavailable'));

    const response = await POST(request());

    expect(deleteOrphanedAudioKey).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ results: [{ id: orphan.id, audioKey: orphan.audioKey, status: 'failed', error: 'Storage unavailable' }] });
  });

  it('continues cleaning unused files after skipping a referenced file', async () => {
    const unused = { ...orphan, id: 'orphan-2', audioKey: 'audio/unused.mp3' };
    vi.mocked(getOrphanedAudioKeys).mockResolvedValue([orphan, unused]);
    vi.mocked(isStorageKeyReferenced).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await POST(request());

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(unused.audioKey);
    expect(deleteOrphanedAudioKey).toHaveBeenCalledExactlyOnceWith(unused.id, 'user-1');
    expect(await response.json()).toEqual({ results: [
      { id: orphan.id, audioKey: orphan.audioKey, status: 'skipped' },
      { id: unused.id, audioKey: unused.audioKey, status: 'deleted' },
    ] });
  });
});
