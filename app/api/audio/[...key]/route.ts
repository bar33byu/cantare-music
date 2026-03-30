import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { BUCKET, r2Client } from '../../../../lib/r2';

export const runtime = 'nodejs';

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
  try {
    const { key: keySegments } = await params;
    if (!Array.isArray(keySegments) || keySegments.length === 0) {
      return NextResponse.json({ error: 'Audio key is required' }, { status: 400 });
    }

    const key = toKey(keySegments);
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

    console.error('Audio proxy error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
