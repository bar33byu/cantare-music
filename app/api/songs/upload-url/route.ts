import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateUploadKey, r2Client, BUCKET } from '../../../../lib/r2';

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
  try {
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

    console.log('[Upload] Sending to R2:', { bucket: BUCKET, key, size: buffer.byteLength });
    await r2Client.send(command);
    console.log('[Upload] Success:', key);

    return NextResponse.json({ key }, { status: 200 });
  } catch (error) {
    console.error('[Upload] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}