import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { BUCKET, getPublicUrl, r2Client } from '../../../../lib/r2';

export const runtime = 'nodejs';

const hasR2Credentials =
  typeof process.env.R2_ACCESS_KEY_ID === 'string' && process.env.R2_ACCESS_KEY_ID.trim().length > 0 &&
  typeof process.env.R2_SECRET_ACCESS_KEY === 'string' && process.env.R2_SECRET_ACCESS_KEY.trim().length > 0;

function toKey(pathSegments: string[]): string {
  return pathSegments.map((segment) => decodeURIComponent(segment)).join('/');
}

function getHeaderValue(value: string | number | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: keySegments } = await params;
  const key = Array.isArray(keySegments) && keySegments.length > 0 ? toKey(keySegments) : null;

  // Server-side debug: log environment variable presence (never print secret values)
  const envPresence = {
    R2_ACCOUNT_ID: typeof process.env.R2_ACCOUNT_ID === 'string' && process.env.R2_ACCOUNT_ID.trim().length > 0 ? 'present' : 'missing',
    R2_ACCESS_KEY_ID: typeof process.env.R2_ACCESS_KEY_ID === 'string' && process.env.R2_ACCESS_KEY_ID.trim().length > 0 ? 'present' : 'missing',
    R2_SECRET_ACCESS_KEY: typeof process.env.R2_SECRET_ACCESS_KEY === 'string' && process.env.R2_SECRET_ACCESS_KEY.trim().length > 0 ? 'present' : 'missing',
    R2_BUCKET_NAME: typeof process.env.R2_BUCKET_NAME === 'string' && process.env.R2_BUCKET_NAME.trim().length > 0 ? 'present' : 'missing',
    R2_PUBLIC_URL: typeof process.env.R2_PUBLIC_URL === 'string' && process.env.R2_PUBLIC_URL.trim().length > 0 ? 'present' : 'missing',
  };

  const tryPublicFallback = (reason: string) => {
    if (!key) return null;
    const publicUrl = getPublicUrl(key);
    if (publicUrl.startsWith('http')) {
      console.info(`Audio proxy: falling back to public URL (${reason})`);
      return NextResponse.redirect(publicUrl, { status: 302 });
    }
    return null;
  };

  try {
    console.info('Audio proxy request received');
    console.info('Env presence:', envPresence);
    if (!key) {
      return NextResponse.json({ error: 'Audio key is required' }, { status: 400 });
    }

    console.info('Requested audio key:', key);

    // If a public URL is available, redirect to it directly — no credentials needed.
    const publicUrl = getPublicUrl(key);
    if (publicUrl.startsWith('http')) {
      return NextResponse.redirect(publicUrl, { status: 302 });
    }

    // No public URL: must proxy through R2. Require credentials.
    if (!hasR2Credentials) {
      return NextResponse.json({ error: 'Audio credentials not configured' }, { status: 503 });
    }

    const range = request.headers.get('range') ?? undefined;

    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: range,
      })
    );

    if (!object.Body) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    const payload = Buffer.from(await object.Body.transformToByteArray());
    const headers = new Headers();

    headers.set('Content-Type', object.ContentType ?? 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');

    const cacheControl = object.CacheControl ?? 'public, max-age=3600';
    headers.set('Cache-Control', cacheControl);

    const contentLength = getHeaderValue(object.ContentLength);
    if (contentLength) headers.set('Content-Length', contentLength);

    const eTag = getHeaderValue(object.ETag);
    if (eTag) headers.set('ETag', eTag);

    const lastModified = object.LastModified?.toUTCString();
    if (lastModified) headers.set('Last-Modified', lastModified);

    const contentRange = getHeaderValue(object.ContentRange);
    if (contentRange) headers.set('Content-Range', contentRange);

    const status = contentRange ? 206 : 200;
    return new NextResponse(payload, { status, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    const notFound = /NoSuchKey|NotFound|404/.test(message);

    if (notFound) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    // Credential/signature errors: fall back to public URL if available.
    const errorCode = (error as { Code?: string })?.Code ?? '';
    const isAuthError =
      /SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/.test(errorCode) ||
      /signature|credentials|access denied|403/i.test(message);
    if (isAuthError) {
      return tryPublicFallback('auth error') ??
        NextResponse.json({ error: 'Audio access denied' }, { status: 403 });
    }

    console.error('Audio proxy error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
