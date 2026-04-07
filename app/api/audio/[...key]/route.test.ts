import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
});

const { sendMock, getObjectCommandCalls } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getObjectCommandCalls: [] as unknown[],
}));

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
      getObjectCommandCalls.push(input);
    }
  },
}));

vi.mock('../../../../lib/r2', () => ({
  BUCKET: 'cantare-audio',
  getPublicUrl: vi.fn(() => '/api/audio/mock-key'),
  r2Client: {
    send: sendMock,
  },
}));

import { GET } from './route';

describe('GET /api/audio/[...key]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getObjectCommandCalls.length = 0;
  });

  it('streams audio with success headers', async () => {
    const body = {
      transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    };

    sendMock.mockResolvedValue({
      Body: body,
      ContentType: 'audio/mpeg',
      ContentLength: 3,
      CacheControl: 'public, max-age=31536000, immutable',
      ETag: '"abc123"',
    });

    const request = new Request('http://localhost/api/audio/audio/song/file.mp3');
    const response = await GET(request as any, {
      params: Promise.resolve({ key: ['audio', 'song', 'file.mp3'] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(getObjectCommandCalls[0]).toEqual({
      Bucket: 'cantare-audio',
      Key: 'audio/song/file.mp3',
      Range: undefined,
    });
  });

  it('returns 206 with content-range when byte range is requested', async () => {
    const body = {
      transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
    };

    sendMock.mockResolvedValue({
      Body: body,
      ContentType: 'audio/mpeg',
      ContentLength: 2,
      ContentRange: 'bytes 0-1/100',
    });

    const request = new Request('http://localhost/api/audio/audio/song/file.mp3', {
      headers: { range: 'bytes=0-1' },
    });
    const response = await GET(request as any, {
      params: Promise.resolve({ key: ['audio', 'song', 'file.mp3'] }),
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-1/100');
    expect(getObjectCommandCalls[0]).toEqual({
      Bucket: 'cantare-audio',
      Key: 'audio/song/file.mp3',
      Range: 'bytes=0-1',
    });
  });

  it('returns 404 when object key does not exist', async () => {
    sendMock.mockRejectedValue(new Error('NoSuchKey'));

    const request = new Request('http://localhost/api/audio/audio/song/missing.mp3');
    const response = await GET(request as any, {
      params: Promise.resolve({ key: ['audio', 'song', 'missing.mp3'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Audio file not found' });
  });
});
