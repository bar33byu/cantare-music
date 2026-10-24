import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';
import { getMemoryReviewStatus, updateMemoryReview } from '../../../../../db/queries';
vi.mock('../../../../../db/queries', () => ({ getMemoryReviewStatus: vi.fn(), updateMemoryReview: vi.fn() }));
vi.mock('../../../_user', () => ({ resolveEffectiveRequestUserId: vi.fn().mockResolvedValue('user-1') }));
const context = { params: Promise.resolve({ id: 'song-1' }) };
beforeEach(() => vi.clearAllMocks());
describe('memory review API', () => {
  it('reads status without mutating ratings', async () => {
    vi.mocked(getMemoryReviewStatus).mockResolvedValue({ due: true } as never);
    const response = await GET(new NextRequest('http://localhost/api/songs/song-1/memory-review'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getMemoryReviewStatus).toHaveBeenCalledWith('song-1', 'user-1');
    expect(updateMemoryReview).not.toHaveBeenCalled();
  });
  it('starts and undoes reviews within the effective user scope', async () => {
    vi.mocked(updateMemoryReview).mockResolvedValue({ changed: true } as never);
    const request = new NextRequest('http://localhost/api/songs/song-1/memory-review');
    expect((await POST(request, context)).status).toBe(200);
    expect(updateMemoryReview).toHaveBeenLastCalledWith('song-1', 'user-1', false);
    expect((await DELETE(request, context)).status).toBe(200);
    expect(updateMemoryReview).toHaveBeenLastCalledWith('song-1', 'user-1', true);
  });
  it('returns 404 for a song outside the user library', async () => {
    vi.mocked(updateMemoryReview).mockResolvedValue(null);
    expect((await POST(new NextRequest('http://localhost/api/songs/missing/memory-review'), context)).status).toBe(404);
  });
});
