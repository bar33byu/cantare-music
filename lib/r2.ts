import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ENDPOINT = process.env.R2_ENDPOINT ?? (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

export const r2Client = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET ?? 'cantare-audio';

function firstTruthy(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0 && c !== 'undefined') return c;
  }
  return undefined;
}

export function getPublicUrl(key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const configuredPublicUrl = firstTruthy(
    process.env.R2_PUBLIC_URL,
    process.env.R2_PUBLIC_BASE_URL,
    process.env.R2_PUBLIC_BASE_UR,
  );

  if (!configuredPublicUrl) {
    // Fallback to same-origin proxy to avoid broken "undefined/..." URLs in production.
    return `/api/audio/${encodedKey}`;
  }

  return `${configuredPublicUrl.replace(/\/$/, '')}/${encodedKey}`;
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
