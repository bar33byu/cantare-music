import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { BUCKET, r2Client } from '../../../../lib/r2';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? undefined;

    const envStatus = {
      R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: !!process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: !!process.env.R2_PUBLIC_URL,
    };

    console.info('R2 debug endpoint called. Env presence:', envStatus, 'keyProvided:', !!key);

    if (!key) {
      return NextResponse.json({ ok: true, env: envStatus });
    }

    // Try a HEAD-like check using HeadObjectCommand to avoid transferring the body
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));

    console.info('HeadObject success for key:', key, {
      ContentLength: head.ContentLength,
      ContentType: head.ContentType,
      ETag: head.ETag,
    });

    return NextResponse.json({ ok: true, meta: { ContentLength: head.ContentLength, ContentType: head.ContentType, ETag: head.ETag } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('R2 debug error:', message);
    const notFound = /NoSuchKey|NotFound|404/.test(message);
    return NextResponse.json({ ok: false, error: message, notFound }, { status: 500 });
  }
}
