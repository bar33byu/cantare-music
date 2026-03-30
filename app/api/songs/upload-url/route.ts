import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateUploadKey, r2Client, BUCKET } from '../../../../lib/r2';

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
  try {
    // Check if R2 is configured
    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2BucketName = process.env.R2_BUCKET_NAME;

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      console.error('[Upload] R2 not configured:', {
        r2AccountId: r2AccountId ? '✓' : '✗',
        r2AccessKeyId: r2AccessKeyId ? '✓' : '✗',
        r2SecretAccessKey: r2SecretAccessKey ? '✓' : '✗',
        r2BucketName: r2BucketName ? '✓' : '✗',
      });
      return NextResponse.json(
        { error: 'R2 storage not configured on server' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const songId = formData.get('songId') as string | null;

    console.log('[Upload] Received request:', { file: file?.name, size: file?.size, songId });

    if (!file || !songId) {
      console.error('[Upload] Missing file or songId');
      return NextResponse.json({ error: 'Missing file or songId' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      console.error('[Upload] File too large:', file.size);
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      console.error('[Upload] Invalid file type:', file.type);
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const key = generateUploadKey(songId, file.name);
    console.log('[Upload] Generated key:', key);

    const buffer = await file.arrayBuffer();
    console.log('[Upload] Buffer size:', buffer.byteLength);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: file.type,
      Body: new Uint8Array(buffer),
    });

    console.log('[Upload] Sending to R2:', { bucket: BUCKET, key, contentType: file.type, size: buffer.byteLength });
    await r2Client.send(command);
    console.log('[Upload] Success:', key);

    return NextResponse.json({ key }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Upload] Error:', errorMsg, error instanceof Error ? error.stack : '');
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}