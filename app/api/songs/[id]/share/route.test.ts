import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../db/queries', () => ({
  disableSongSharing: vi.fn(),
  enableSongSharing: vi.fn(),
  getSongById: vi.fn(),
  rotateSongShareLink: vi.fn(),
}));

vi.mock('../../../_user', () => ({
  resolveEffectiveRequestUserId: vi.fn(async () => 'default'),
}));

import { DELETE, PATCH, POST } from './route';
import { disableSongSharing, enableSongSharing, getSongById, rotateSongShareLink } from '../../../../../db/queries';

describe('/api/songs/[id]/share', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a share link for an owned song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song' } as any);
    vi.mocked(enableSongSharing).mockResolvedValue({
      id: 'song-1',
      shareToken: 'song-token',
      sharedAt: '2026-06-05T12:00:00.000Z',
      shareAudioMode: 'blend',
    });

    const request = new Request('http://localhost/api/songs/song-1/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareAudioMode: 'blend' }),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'song-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(enableSongSharing).toHaveBeenCalledWith('song-1', 'default', 'blend');
    expect(data.shareUrl).toBe('http://localhost/share/songs/song-token');
  });

  it('rotates a share link for an owned song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song' } as any);
    vi.mocked(rotateSongShareLink).mockResolvedValue({
      id: 'song-1',
      shareToken: 'new-token',
      sharedAt: '2026-06-05T12:00:00.000Z',
      shareAudioMode: 'both',
    });

    const response = await PATCH(new Request('http://localhost/api/songs/song-1/share', { method: 'PATCH' }) as any, {
      params: Promise.resolve({ id: 'song-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(rotateSongShareLink).toHaveBeenCalledWith('song-1', 'default');
    expect(data.shareUrl).toBe('http://localhost/share/songs/new-token');
  });

  it('disables sharing for an owned song', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-1', title: 'Song' } as any);
    vi.mocked(disableSongSharing).mockResolvedValue(true);

    const response = await DELETE(new Request('http://localhost/api/songs/song-1/share', { method: 'DELETE' }) as any, {
      params: Promise.resolve({ id: 'song-1' }),
    });

    expect(response.status).toBe(204);
    expect(disableSongSharing).toHaveBeenCalledWith('song-1', 'default');
  });

  it('returns 404 when the song is not owned', async () => {
    vi.mocked(getSongById).mockResolvedValue(undefined);

    const response = await POST(new Request('http://localhost/api/songs/song-x/share', { method: 'POST' }) as any, {
      params: Promise.resolve({ id: 'song-x' }),
    });

    expect(response.status).toBe(404);
    expect(enableSongSharing).not.toHaveBeenCalled();
  });
});
