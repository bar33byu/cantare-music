import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { r2Client, generateUploadKey } from '../../../../lib/r2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSongById } from '../../../../db/queries';

vi.mock('../../../../lib/r2', () => ({
  r2Client: { mocked: true },
  generateUploadKey: vi.fn(),
  BUCKET: 'test-bucket',
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('../../../../db/queries', () => ({
  getSongById: vi.fn(),
}));

describe('POST /api/songs/upload-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  it('returns 200 with uploadUrl and key', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-123' } as any);
    vi.mocked(generateUploadKey).mockReturnValue('audio/song-123/1234567-test.mp3');
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.r2.dev/presigned-url');

    const request = new Request('http://localhost/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-123',
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
        size: 1024,
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      uploadUrl: 'https://example.r2.dev/presigned-url',
      key: 'audio/song-123/1234567-test.mp3',
    });
    expect(generateUploadKey).toHaveBeenCalledWith('default', 'song-123', 'test.mp3');
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it('returns 400 when size is greater than 15 MB', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-123' } as any);
    const request = new Request('http://localhost/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-123',
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
        size: 15_000_001,
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'File too large' });
  });

  it('returns 400 when contentType is invalid', async () => {
    vi.mocked(getSongById).mockResolvedValue({ id: 'song-123' } as any);
    const request = new Request('http://localhost/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-123',
        filename: 'test.wav',
        contentType: 'audio/wav',
        size: 1024,
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid file type' });
  });

  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Missing required fields' });
  });
});