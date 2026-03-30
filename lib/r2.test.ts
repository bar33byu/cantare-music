import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const deleteObjectCommandCalls: unknown[] = [];

class S3ClientMock {
  send = sendMock;

  constructor(_config?: unknown) {}
}

class DeleteObjectCommandMock {
  input: unknown;

  constructor(input: unknown) {
    this.input = input;
    deleteObjectCommandCalls.push(input);
  }
}

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientMock,
  DeleteObjectCommand: DeleteObjectCommandMock,
}));

describe('r2 helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    deleteObjectCommandCalls.length = 0;

    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    process.env.R2_BUCKET_NAME = 'cantare-audio';
    process.env.R2_ACCOUNT_ID = 'acct123';
    process.env.R2_ACCESS_KEY_ID = 'key123';
    process.env.R2_SECRET_ACCESS_KEY = 'secret123';
  });

  it('getPublicUrl returns correct URL', async () => {
    const { getPublicUrl } = await import('./r2');
    expect(getPublicUrl('audio/test.mp3')).toBe('https://cdn.example.com/audio/test.mp3');
  });

  it('getPublicUrl encodes special characters in object keys', async () => {
    const { getPublicUrl } = await import('./r2');
    expect(
      getPublicUrl('audio/song-1/1774834932832-1547.1 [Brad] Hail_the_Day.mp3')
    ).toBe(
      'https://cdn.example.com/audio/song-1/1774834932832-1547.1%20%5BBrad%5D%20Hail_the_Day.mp3'
    );
  });

  it('generateUploadKey returns string starting with audio/', async () => {
    const { generateUploadKey } = await import('./r2');
    expect(generateUploadKey('song-1', 'clip.mp3')).toMatch(/^audio\//);
  });

  it('deleteObject calls S3Client.send with DeleteObjectCommand', async () => {
    const { deleteObject } = await import('./r2');

    await deleteObject('audio/song-1/file.mp3');

    expect(deleteObjectCommandCalls).toEqual([
      {
        Bucket: 'cantare-audio',
        Key: 'audio/song-1/file.mp3',
      },
    ]);

    expect(sendMock).toHaveBeenCalledTimes(1);

    const sentArg = sendMock.mock.calls[0][0] as { input?: unknown };
    expect(sentArg.input).toEqual({
      Bucket: 'cantare-audio',
      Key: 'audio/song-1/file.mp3',
    });
  });
});
