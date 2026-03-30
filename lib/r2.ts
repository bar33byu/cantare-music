import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME ?? 'cantare-audio';

export function getPublicUrl(key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const configuredPublicUrl = process.env.R2_PUBLIC_URL;
  const hasConfiguredPublicUrl =
    typeof configuredPublicUrl === 'string' &&
    configuredPublicUrl.trim().length > 0 &&
    configuredPublicUrl !== 'undefined';

  if (!hasConfiguredPublicUrl) {
    // Fallback to same-origin proxy to avoid broken "undefined/..." URLs in production.
    return `/api/audio/${encodedKey}`;
  }

  return `${configuredPublicUrl}/${encodedKey}`;
}

export function generateUploadKey(songId: string, filename: string): string {
  return `audio/${songId}/${Date.now()}-${filename}`;
}

export async function deleteObject(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
}
