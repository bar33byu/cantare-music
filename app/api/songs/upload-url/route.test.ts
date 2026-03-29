import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { r2Client, generateUploadKey } from '../../../../lib/r2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

vi.mock('../../../../lib/r2', () => ({
  r2Client: { mocked: true },
  generateUploadKey: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('POST /api/songs/upload-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  it('returns 200 with uploadUrl and key', async () => {
    vi.mocked(generateUploadKey).mockReturnValue('songs/song-123/test.mp3');
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/upload');

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
      uploadUrl: 'https://example.com/upload',
      key: 'songs/song-123/test.mp3',
    });
    expect(generateUploadKey).toHaveBeenCalledWith('song-123', 'test.mp3');
    expect(getSignedUrl).toHaveBeenCalledWith(r2Client, expect.any(Object), { expiresIn: 300 });
  });

  it('returns 400 when size is greater than 15 MB', async () => {
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
    expect(generateUploadKey).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when contentType is invalid', async () => {
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
    expect(generateUploadKey).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/songs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-123',
        filename: 'test.mp3',
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Missing required fields' });
    expect(generateUploadKey).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});